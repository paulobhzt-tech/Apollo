"""HTTP contract for enrollment and sector-scoped delivery on disposable MongoDB."""

import asyncio
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from lib.auth import current_user
from lib.db import db
from lib.orders import now
from routers.print_agents import router


@pytest.mark.asyncio(loop_scope="session")
async def test_enrollment_reservation_and_outcome_replay():
    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer MongoDB descartável")
    fixture = uuid4().hex
    printer, sector, queue = f"printer-{fixture}", f"setor-{fixture}", "Fila fictícia"
    ticket_id = f"ticket-{fixture}"
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[current_user] = lambda: {"id": fixture, "role": "admin"}
    await db.printers.insert_one({"id": printer, "active": True, "paper": "80mm", "purpose": sector,
                                  "device_name": queue, "copies": 2})
    await db.environments.insert_one({"key": sector, "name": "Setor fictício"})
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://fixture") as client:
            poll = {"queue": queue}
            assert (await client.post("/print-agents/jobs/next", json=poll)).status_code == 401
            created = await client.post("/print-agents", json={"name": "Terminal fictício", "printer_id": printer})
            assert created.status_code == 201
            assert created.headers["Cache-Control"] == "no-store"
            terminal = created.json()
            headers = {"Authorization": f"Bearer {terminal['token']}"}
            other = (await client.post("/print-agents", json={"name": "Segundo terminal", "printer_id": printer})).json()
            other_headers = {"Authorization": f"Bearer {other['token']}"}
            assert all("token" not in row for row in (await client.get("/print-agents")).json())
            assert (await client.post("/print-agents/jobs/next", json={"queue": "Fila diferente"}, headers=headers)).status_code == 409

            await db.kitchen_tickets.insert_one({
                "id": ticket_id, "label": "Mesa fictícia", "order_number": 123, "order_id": "pedido",
                "created_at": now() + timedelta(seconds=1), "source": "mesa", "items": [
                    {"station": sector, "name": "Espetinho", "qty": 2, "notes": "Sem pimenta"},
                    {"station": "outro-setor", "name": "Item privado", "qty": 1},
                ],
            })
            claims = await asyncio.gather(*[
                client.post("/print-agents/jobs/next", json=poll, headers=headers) for _ in range(2)
            ])
            assert all(response.status_code == 200 for response in claims)
            jobs = [response.json() for response in claims if response.json()]
            assert len(jobs) == 1
            job = jobs[0]
            assert job["queue"] == queue and job["copies"] == 2
            assert "2x Espetinho" in job["lines"] and "OBS: Sem pimenta" in job["lines"]
            assert "Item privado" not in " ".join(job["lines"])

            path = f"/print-agents/jobs/{ticket_id}/result"
            outcome = {"attempt_id": job["attempt_id"], "station": sector, "outcome": "spooler_accepted"}
            assert (await client.post(path, json=outcome, headers=other_headers)).status_code == 409
            assert (await client.post(path, json={**outcome, "outcome": "operator_confirmed"}, headers=headers)).status_code == 422
            for _ in range(2):
                assert (await client.post(path, json=outcome, headers=headers)).status_code == 200
            assert (await client.post("/print-agents/jobs/next", json=poll, headers=headers)).json() is None
            ticket = await db.kitchen_tickets.find_one({"id": ticket_id})
            assert ticket["printed"] == [sector]
            assert ticket["print_attempts"][0]["state"] == "spooler_accepted"
            assert (await client.post(f"/print-agents/{terminal['id']}/revoke")).status_code == 200
            assert (await client.post("/print-agents/jobs/next", json=poll, headers=headers)).status_code == 401
    finally:
        await db.printers.delete_one({"id": printer})
        await db.environments.delete_one({"key": sector})
        await db.kitchen_tickets.delete_one({"id": ticket_id})
        await db.print_agents.delete_many({"created_by": fixture})
