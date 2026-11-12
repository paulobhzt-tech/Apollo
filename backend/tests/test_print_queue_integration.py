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
