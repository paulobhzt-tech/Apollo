"""Restore roundtrip runs ONLY in an explicitly disposable Mongo database.

APOLLO_ALLOW_DISPOSABLE_RESTORE=1 DB_NAME=apollo_restore_test_<suffix> ... pytest
Neither a generic local DB nor a production DB can pass the fixture guard.
"""
import gzip
import hashlib
import json
import os
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from lib.audit import audit_event, verify_event
from models.schemas import RestoreIn
from routers import config, production


@pytest_asyncio.fixture
async def disposable_database(monkeypatch):
    name = os.getenv("DB_NAME", "")
    if os.getenv("APOLLO_ALLOW_DISPOSABLE_RESTORE") != "1":
        pytest.skip("Set APOLLO_ALLOW_DISPOSABLE_RESTORE=1 for disposable restore tests")
    if not name.startswith("apollo_restore_test_") or len(name) <= len("apollo_restore_test_"):
        pytest.fail("Restore test refused: DB_NAME must start with apollo_restore_test_ and a suffix")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000, tz_aware=True)
    database = client[name]
    await client.admin.command("ping")
    # Fail rather than clearing a database that this test did not create/seed.
    if await database.list_collection_names():
        client.close()
        pytest.fail("Restore test refused: disposable database must initially be empty")
    monkeypatch.setattr(config, "db", database)
    monkeypatch.setattr(production, "db", database)
    try:
        yield database
    finally:
        # Guard checked above, and this DB was empty before this fixture seeded it.
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_business_inventory_and_audit_restore_roundtrip(disposable_database, monkeypatch):
    db = disposable_database
    monkeypatch.setenv("AUDIT_SIGNING_KEY", "disposable-restore-key-at-least-32-characters")
    sealed = audit_event("payment_recorded", {"id": "cashier"}, values={"total": 60})
    await db.employees.insert_many([
        {"id": "admin", "name": "Admin", "role": "admin", "active": True, "pin_hash": "admin-pin", "password_hash": "admin-password"},
        {"id": "cashier", "name": "Cashier", "role": "caixa", "active": True, "pin_hash": "cashier-pin", "password_hash": "cashier-password"},
        {"id": "new-employee", "name": "New", "active": True},
    ])
    source = {
        "products": [{"id": "product", "name": "Espetinho", "price": 12, "recipe": [{"ingredient_id": "meat", "qty": 0.1}]}],
        "ingredients": [{"id": "meat", "stock": 9.5, "unit": "kg"}],
        "purchases": [{"id": "lot", "ingredient_id": "meat", "remaining_qty": 9.5, "lot": "L001"}],
        "lot_consumptions": [{"ingredient_id": "meat", "purchase_id": "lot", "order_id": "order", "qty": 0.5}],
        "inventory_counts": [{"id": "count", "ingredient_id": "meat", "qty": 9.5}],
        "production_batches": [{"id": "batch", "qty": 50, "ingredient_id": "meat"}],
        "orders": [{"id": "order", "number": 123, "total": 60, "status": "pago", "audit_events": [sealed]}],
        "cash_sessions": [{"id": "cash", "status": "fechado", "audit_events": [{"action": "cash_closed"}]}],
        "bills": [{"id": "bill", "status": "pago", "amount": 80}],
        "bill_audit": [{"id": "bill-audit", "action": "paid", "actor_id": "admin"}],
        "employee_audit": [{"id": "employee-audit", "action": "updated"}],
        "employee_time_entries": [{"id": "time-entry", "employee_id": "cashier"}],
        "backup_audit": [{"id": "backup-audit", "action": "created"}],
        "live_music_events": [{"id": "music", "artist": "Homologacao", "cover": 10}],
        "account_categories": [{"id": "account-cat", "name": "Compras"}],
        "payment_methods": [{"id": "method", "key": "pix", "active": True}],
        "supplier_quotes": [{"id": "quote", "supplier_id": "supplier", "ingredient_id": "meat"}],
    }
    for collection, documents in source.items():
        await db[collection].insert_many(deepcopy(documents))
    await db.settings.insert_many([
        {"_id": "drive", "refresh_token": "local-drive-secret"},
        {"_id": "sync_identity", "id": "local-installation"},
        {"_id": "selftest_last", "value": "local"},
        {"_id": "general", "name": "Apollo Test"},
    ])
    _, backup = await config.build_backup()
    assert "pin_hash" not in json.dumps(backup)
    assert "password_hash" not in json.dumps(backup)
    assert {d["_id"] for d in backup["data"]["settings"]} == {"general"}
    # Simulate foreign/legacy backup attempting to overwrite install identity and actor.
    backup["data"]["settings"] += [{"_id": "sync_identity", "id": "foreign-installation"}, {"_id": "drive", "refresh_token": "foreign"}]
    backup["data"]["employees"][0].update(active=False, role="garcom", pin_hash="injected", password_hash="injected")
    cashier = next(e for e in backup["data"]["employees"] if e["id"] == "cashier")
    cashier.update(pin_hash="injected", password_hash="injected")
    await db.products.update_one({"id": "product"}, {"$set": {"price": 99}})
    await db.orders.insert_one({"id": "post-backup", "number": 124})
    restored = await config.restore(RestoreIn(data=backup["data"]), {"id": "admin"})
    assert restored.counts["purchases"] == 1
    for collection, documents in source.items():
        assert await db[collection].find({}, {"_id": 0}).to_list(100) == documents
    admin = await db.employees.find_one({"id": "admin"})
    assert admin["active"] is True and admin["role"] == "admin"
    assert admin["pin_hash"] == "admin-pin" and admin["password_hash"] == "admin-password"
    cashier = await db.employees.find_one({"id": "cashier"})
    assert cashier["pin_hash"] == "cashier-pin" and cashier["password_hash"] == "cashier-password"
    assert (await db.employees.find_one({"id": "new-employee"}))["active"] is False
    assert (await db.settings.find_one({"_id": "sync_identity"}))["id"] == "local-installation"
    assert (await db.settings.find_one({"_id": "drive"}))["refresh_token"] == "local-drive-secret"
    assert (await db.counters.find_one({"_id": "order"}))["seq"] >= 123
    assert verify_event((await db.orders.find_one({"id": "order"}))["audit_events"][0]) == "valid"
    snapshot = await db.restore_safety_backups.find_one({})
    raw = gzip.decompress(snapshot["blob"])
    assert hashlib.sha256(raw).hexdigest() == snapshot["sha256"]
    safety = json.loads(raw)["data"]
    assert next(p for p in safety["products"] if p["id"] == "product")["price"] == 99
    assert any(order["id"] == "post-backup" for order in safety["orders"])


@pytest.mark.asyncio
async def test_snapshot_failure_stops_before_destructive_operations(monkeypatch):
    failure = AsyncMock(side_effect=RuntimeError("backup storage unavailable"))
    monkeypatch.setattr(config, "save_restore_safety_snapshot", failure)
    # No collection access exists: any attempted delete or replacement would fail.
    monkeypatch.setattr(config, "db", SimpleNamespace())
    with pytest.raises(RuntimeError, match="backup storage unavailable"):
        await config.restore(RestoreIn(data={"products": [{"id": "p1"}]}), {"id": "admin"})
    failure.assert_awaited_once_with("admin")


@pytest.mark.asyncio
async def test_duplicate_ids_fail_before_snapshot_or_deletes(monkeypatch):
    snapshot = AsyncMock()
    monkeypatch.setattr(config, "save_restore_safety_snapshot", snapshot)
    monkeypatch.setattr(config, "db", SimpleNamespace())
    with pytest.raises(HTTPException) as exc:
        await config.restore(RestoreIn(data={"products": [{"id": "p1"}, {"id": "p1"}]}), {"id": "admin"})
    assert exc.value.status_code == 400
    snapshot.assert_not_awaited()


def test_revive_preserves_signed_event_bytes():
    event = {"action": "payment_recorded", "at": "2026-11-10T23:00:00+00:00", "seal": "unchanged"}
    restored = config.revive({"paid_at": "2026-11-10T23:00:00+00:00", "audit_events": [event]})
    assert restored["audit_events"][0] == event
    assert not isinstance(restored["paid_at"], str)
