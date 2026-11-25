"""Exercise the production print queue against a disposable MongoDB."""
from datetime import timedelta
from uuid import uuid4

import pytest

from lib.db import db
from lib.orders import now
from routers.production import print_queue


@pytest.mark.asyncio(loop_scope="session")
async def test_completed_tickets_do_not_hide_pending_stations():
    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer um MongoDB descartável")
    tag = uuid4().hex
    kitchen, bar = f"{tag}-kitchen", f"{tag}-bar"
    created = now()

    def ticket(number, *, printed, items, age_minutes=0, status="novo"):
        return {
            "id": f"{tag}-{number}",
            "test_tag": tag,
            "created_at": created - timedelta(minutes=age_minutes),
            "printed": printed,
            "items": items,
            "status": status,
        }

    sectors = [{"station": kitchen}, {"station": bar}]
    rows = [
        ticket(i, printed=[kitchen, bar], items=sectors, age_minutes=10)
        for i in range(200)
    ]
    rows.extend([
        ticket(200, printed=[kitchen], items=sectors),
        ticket(201, printed=[], items=[{"station": bar, "print_ticket": False}]),
        ticket(202, printed=[], items=sectors, status="entregue"),
        ticket(203, printed=[], items=sectors, age_minutes=181),
    ])
    await db.kitchen_tickets.insert_many(rows)
    try:
        assert await print_queue(kitchen, {}) == []
        pending = await print_queue(f"{kitchen},{bar},{bar}", {})
        assert [row["id"] for row in pending] == [f"{tag}-200"]
    finally:
        await db.kitchen_tickets.delete_many({"test_tag": tag})


@pytest.mark.asyncio(loop_scope="session")
async def test_initial_print_is_exclusive_and_uncertain_attempt_requires_review():
    import asyncio

    from fastapi import HTTPException

    from models.schemas import PrintResultIn, PrintReviewIn, TicketPrintedIn
    from routers.production import record_print_result, reserve_print, review_print, unresolved_prints

    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer um MongoDB descartável")
    ticket_id = uuid4().hex
    station = uuid4().hex
    actor = {"id": "operator"}
    reviewer = {"id": "admin"}
    body = TicketPrintedIn(station=station)
    await db.kitchen_tickets.insert_one({
        "id": ticket_id, "status": "novo", "created_at": now(),
        "items": [{"station": station}, {"station": "bar", "print_ticket": False}],
    })
    try:
        assert [entry["id"] for entry in await print_queue(station, {})] == [ticket_id]
        claims = await asyncio.gather(
            reserve_print(ticket_id, body, actor),
            reserve_print(ticket_id, body, {"id": "second-operator"}),
            return_exceptions=True,
        )
        attempt, = [claim for claim in claims if not isinstance(claim, BaseException)]
        conflict, = [claim for claim in claims if isinstance(claim, HTTPException)]
        assert conflict.status_code == 409
        assert await print_queue(station, {}) == []

        result = PrintResultIn(station=station, attempt_id=attempt.id, outcome="indeterminate")
        with pytest.raises(HTTPException) as unauthorized:
            await record_print_result(ticket_id, result, {"id": "another-operator"})
        assert unauthorized.value.status_code == 409
        assert "printed" not in await record_print_result(ticket_id, result, {"id": attempt.actor_id})
        assert "printed" not in await record_print_result(ticket_id, result, {"id": attempt.actor_id})
        assert [entry["id"] for entry in await unresolved_prints({})] == [ticket_id]

        review = PrintReviewIn(station=station, attempt_id=attempt.id, printed=False)
        assert (await review_print(ticket_id, review, reviewer))["print_attempts"] == []
        attempt = await reserve_print(ticket_id, body, actor)
        accepted = PrintResultIn(station=station, attempt_id=attempt.id, outcome="spooler_accepted")
        saved = await record_print_result(ticket_id, accepted, actor)
        assert saved == await record_print_result(ticket_id, accepted, actor)
        assert saved["print_attempts"][0]["state"] == "spooler_accepted"
        assert saved["printed"] == [station]
        assert saved["audit_events"][0]["actor_id"] == reviewer["id"]
        assert await print_queue(station, {}) == []
        assert await unresolved_prints({}) == []

        with pytest.raises(HTTPException) as hidden:
            await reserve_print(ticket_id, TicketPrintedIn(station="bar"), actor)
        assert hidden.value.status_code == 409
    finally:
        await db.kitchen_tickets.delete_one({"id": ticket_id})


@pytest.mark.asyncio(loop_scope="session")
async def test_waiter_print_status_uses_the_active_order_and_printable_sectors():
    from fastapi import HTTPException

    from routers.tables import table_print_status

    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer um MongoDB descartável")
    table_id, order_id, ticket_id = (uuid4().hex for _ in range(3))
    user = {"id": "waiter"}
    await db.tables.insert_one({"id": table_id, "order_id": order_id})
    await db.kitchen_tickets.insert_one({
        "id": ticket_id, "order_id": order_id, "created_at": now(), "printed": ["bar"],
        "items": [{"station": "cozinha", "print_ticket": False}, {"station": "bar"}, {"station": "churrasqueira"}],
    })
    try:
        rows = await table_print_status(table_id, order_id, user)
        assert [(row.ticket_id, row.station, row.printed) for row in rows] == [
            (ticket_id, "bar", True), (ticket_id, "churrasqueira", False),
        ]
        with pytest.raises(HTTPException) as changed:
            await table_print_status(table_id, "old-order", user)
        assert changed.value.status_code == 409
    finally:
        await db.kitchen_tickets.delete_one({"id": ticket_id})
        await db.tables.delete_one({"id": table_id})
