"""Operational audit is atomic with mutations, excludes credentials, and is admin-only."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import FastAPI
from lib.audit import audit_event, verify_event
from lib.auth import current_user
from models.schemas import CashMoveIn, CashCloseIn, CancelIn, TicketStatusIn
from routers import operations


def test_signed_event_detects_tampering_and_filters_credentials(monkeypatch):
    monkeypatch.setenv("AUDIT_SIGNING_KEY", "test-only-key-longer-than-32-characters")
    event = audit_event("cash_sangria", {"id": "u1", "name": "Admin", "role": "admin", "pin_hash": "private"},
                        values={"amount": 20, "password": "private", "cpf": "private", "total": float("nan")})
    assert "private" not in str(event)
    assert event["values"] == {"amount": 20}
    assert verify_event(event) == "valid"
    changed = deepcopy(event)
    changed["values"]["amount"] = 200
    assert verify_event(changed) == "invalid"
    monkeypatch.delenv("AUDIT_SIGNING_KEY")
    assert verify_event(event) == "key_unavailable"


def test_unconfigured_signing_is_never_reported_as_verified(monkeypatch):
    monkeypatch.delenv("AUDIT_SIGNING_KEY", raising=False)
    assert verify_event(audit_event("cash_opened", {"id": "u1"})) == "unsigned"


@pytest.mark.asyncio
async def test_cancel_claim_is_conditional_and_audited_before_stock(monkeypatch):
    orders = SimpleNamespace(find_one=AsyncMock(return_value={"id": "o1", "status": "pago", "total": 10}),
                             update_one=AsyncMock(return_value=SimpleNamespace(modified_count=0)))
    monkeypatch.setattr(operations, "db", SimpleNamespace(orders=orders))
    monkeypatch.setattr(operations, "cancel_authorizer", AsyncMock(return_value="Manager"))
    stock = AsyncMock()
    monkeypatch.setattr(operations, "move_stock", stock)
    with pytest.raises(operations.HTTPException) as exc:
        await operations.cancel_order("o1", CancelIn(reason="Pedido errado", manager_pin="secret"), {"id": "u1", "name": "Cashier"})
    assert exc.value.status_code == 409
    query, change = orders.update_one.await_args.args
    assert query == {"id": "o1", "status": "pago"}
    event = change["$push"]["audit_events"]
    assert event["action"] == "order_cancelled"
    assert event["authorized_by"] == "Manager"
    assert "secret" not in str(event)
    stock.assert_not_awaited()


@pytest.mark.asyncio
async def test_cash_move_audit_is_part_of_same_write(monkeypatch):
    cash = SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)),
                           find_one=AsyncMock(return_value={"id": "c1"}))
    monkeypatch.setattr(operations, "db", SimpleNamespace(cash_sessions=cash))
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "c1"}))
    monkeypatch.setattr(operations, "cash_summary", AsyncMock(side_effect=lambda s: s))
    await operations.cash_move(CashMoveIn(type="suprimento", amount=30, note="Troco inicial"), {"id": "u1", "name": "Operator"})
    query, update = cash.update_one.await_args.args
    assert query["id"] == "c1" and query["status"] == "aberto"
    assert "$expr" in query
    assert update["$push"]["audit_events"]["values"]["amount"] == 30
    assert update["$push"]["movements"]["amount"] == 30


@pytest.mark.asyncio
async def test_audit_endpoint_denies_cashier_before_db_access(monkeypatch):
    app = FastAPI()
    app.include_router(operations.router)
    app.dependency_overrides[current_user] = lambda: {"id": "u1", "role": "caixa"}
    monkeypatch.setattr(operations, "db", None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/audit/operations")).status_code == 403


@pytest.mark.asyncio
async def test_audit_endpoint_returns_only_projected_events_and_bounded_limit(monkeypatch):
    event = audit_event("cash_opened", {"id": "u1"})
    def collection():
        cursor = SimpleNamespace(to_list=AsyncMock(return_value=[{"id": "record", "audit_events": event}]))
        return SimpleNamespace(aggregate=Mock(return_value=cursor))
    collections = {name: collection() for name in ("orders", "cash_sessions", "kitchen_tickets")}
    monkeypatch.setattr(operations, "db", collections)
    app = FastAPI()
    app.include_router(operations.router)
    app.dependency_overrides[current_user] = lambda: {"id": "u1", "role": "admin"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/audit/operations?limit=501")).status_code == 422
        response = await client.get("/audit/operations?limit=2&record_id=record&action=cash_opened")
    assert response.status_code == 200
    assert len(response.json()["events"]) == 2
    for col in collections.values():
        pipeline = col.aggregate.call_args.args[0]
        assert pipeline[0] == {"$match": {"id": "record"}}
        assert pipeline[1] == {"$project": {"_id": 0, "id": 1, "audit_events": 1}}


@pytest.mark.asyncio
async def test_audit_merges_legacy_datetime_and_iso_events_chronologically(monkeypatch):
    from datetime import datetime, timezone
    legacy = {"id": "old-schema", "action": "counter_sale_created", "at": datetime(2026, 11, 10, 20, tzinfo=timezone.utc)}
    modern = {"id": "modern", "action": "payment_recorded", "at": "2026-11-10T19:00:00+00:00"}
    collections = {}
    for name in ("orders", "cash_sessions", "kitchen_tickets"):
        rows = [{"id": "r1", "audit_events": modern}, {"id": "r2", "audit_events": legacy}] if name == "orders" else []
        collections[name] = SimpleNamespace(aggregate=Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=rows))))
    monkeypatch.setattr(operations, "db", collections)
    result = await operations.operational_audit(action=None, record_id=None, limit=100, _={"role": "admin"})
    assert [row["event"]["id"] for row in result["events"]] == ["old-schema", "modern"]
    assert any("$set" in stage and "audit_sort_at" in stage["$set"] for stage in collections["orders"].aggregate.call_args.args[0])


@pytest.mark.asyncio
async def test_alert_endpoint_is_admin_only_before_reading_audit(monkeypatch):
    app = FastAPI()
    app.include_router(operations.router)
    app.dependency_overrides[current_user] = lambda: {"id": "u1", "role": "caixa"}
    history = AsyncMock()
    monkeypatch.setattr(operations, "operational_audit", history)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/audit/alerts")).status_code == 403
    history.assert_not_awaited()


@pytest.mark.asyncio
async def test_alert_endpoint_is_bounded_and_does_not_enforce_actions(monkeypatch):
    row = {"source": "cash_sessions", "record_id": "c1", "integrity": "unsigned",
           "event": {"id": "event", "action": "cash_closed", "actor_id": "u1", "values": {"difference": -30}}}
    history = AsyncMock(return_value={"events": [row]})
    monkeypatch.setattr(operations, "operational_audit", history)
    result = await operations.administrative_audit_alerts({"id": "u1", "role": "admin"})
    assert result["alerts"][0]["rule"] == "cash_difference"
    assert result["sample_size"] == 1
    assert history.await_args.kwargs["limit"] == 500


@pytest.mark.asyncio
async def test_simultaneous_withdrawals_cannot_both_use_stale_movement_balance(monkeypatch):
    import asyncio
    snapshot = {"id": "c1", "movements": []}
    arrived = 0
    barrier = asyncio.Event()
    async def current():
        nonlocal arrived
        arrived += 1
        if arrived == 2: barrier.set()
        await barrier.wait()
        return deepcopy(snapshot)
    stored = []
    async def update(query, changes):
        expected = query["$expr"]["$eq"][1]
        if len(stored) != expected: return SimpleNamespace(modified_count=0)
        stored.append(changes["$push"]["movements"])
        return SimpleNamespace(modified_count=1)
    cash = SimpleNamespace(update_one=AsyncMock(side_effect=update), find_one=AsyncMock(return_value=snapshot))
    monkeypatch.setattr(operations, "db", SimpleNamespace(cash_sessions=cash))
    monkeypatch.setattr(operations, "current_cash", current)
    monkeypatch.setattr(operations, "cash_summary", AsyncMock(side_effect=lambda s: {**s, "expected_cash": 100}))
    user = {"id": "u1", "name": "Cashier"}
    results = await asyncio.gather(*(operations.cash_move(CashMoveIn(type="sangria", amount=60, note="Retirada teste"), user) for _ in range(2)), return_exceptions=True)
    assert len(stored) == 1
    conflicts = [result for result in results if isinstance(result, operations.HTTPException)]
    assert len(conflicts) == 1 and conflicts[0].status_code == 409
