"""Regression tests for atomic settlement of accounts payable/receivable."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import finance


@pytest.fixture
def bills(monkeypatch):
    collection = SimpleNamespace(find_one_and_update=AsyncMock(), find_one=AsyncMock(), delete_one=AsyncMock())
    monkeypatch.setattr(finance, "db", SimpleNamespace(bills=collection))
    return collection


@pytest.mark.asyncio
async def test_pay_bill_only_updates_open_bill(monkeypatch, bills):
    update = AsyncMock(return_value={"id": "bill-1", "status": "pago"})
    bills.find_one_and_update = update
    monkeypatch.setattr(finance, "audit_bill_change", AsyncMock())
    body = type("Payment", (), {"model_dump": lambda self: {"paid_amount": 42.0}})()
    result = await finance.pay_bill("bill-1", body, {"role": "caixa"})
    assert result["status"] == "pago"
    query = update.await_args.args[0]
    assert query == {"id": "bill-1", "status": "aberto"}


@pytest.mark.asyncio
async def test_pay_bill_rejects_duplicate_settlement(bills):
    bills.find_one_and_update = AsyncMock(return_value=None)
    bills.find_one = AsyncMock(return_value={"status": "pago"})
    body = type("Payment", (), {"model_dump": lambda self: {"paid_amount": 42.0}})()
    with pytest.raises(HTTPException) as error:
        await finance.pay_bill("bill-1", body, {"role": "caixa"})
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_reopen_only_closed_bills(monkeypatch, bills):
    update = AsyncMock(return_value={"id": "bill-1", "status": "aberto"})
    bills.find_one_and_update = update
    monkeypatch.setattr(finance, "audit_bill_change", AsyncMock())
    await finance.reopen_bill("bill-1", {"role": "admin"})
    assert update.await_args.args[0]["status"] == {"$in": ["pago", "cancelado"]}


@pytest.mark.asyncio
async def test_financial_audit_contains_actor_and_no_credentials(monkeypatch):
    insert = AsyncMock()
    monkeypatch.setattr(finance, "db", SimpleNamespace(bill_audit=SimpleNamespace(insert_one=insert)))
    await finance.audit_bill_change(
        "paid", {"id": "cashier-1", "pin_hash": "private"},
        {"id": "bill-1", "kind": "pagar", "status": "pago", "customer": "private"},
    )
    entry = insert.await_args.args[0]
    assert entry["actor_id"] == "cashier-1"
    assert entry["bill_id"] == "bill-1"
    assert "pin_hash" not in entry
    assert "customer" not in entry


@pytest.mark.asyncio
async def test_delete_bill_rejects_settled_record(bills):
    deleted = AsyncMock(return_value=SimpleNamespace(deleted_count=0))
    bills.delete_one = deleted
    bills.find_one = AsyncMock(return_value={"status": "pago"})
    with pytest.raises(HTTPException) as error:
        await finance.delete_bill("bill-1", {"role": "admin"})
    assert error.value.status_code == 409
    assert deleted.await_args.args[0] == {"id": "bill-1", "status": "aberto"}


@pytest.mark.asyncio
async def test_cancel_bill_records_audit_event(monkeypatch, bills):
    cancelled = {"id": "bill-1", "kind": "pagar", "status": "cancelado"}
    update = AsyncMock(return_value=cancelled)
    audit = AsyncMock()
    bills.find_one_and_update = update
    monkeypatch.setattr(finance, "audit_bill_change", audit)
    actor = {"id": "admin-1", "name": "Admin", "role": "admin"}
    result = await finance.cancel_bill("bill-1", actor)
    assert result["status"] == "cancelado"
    assert update.await_args.args[0] == {"id": "bill-1", "status": "aberto"}
    audit.assert_awaited_once_with("cancelled", actor, cancelled)


@pytest.mark.asyncio
async def test_update_bill_rechecks_open_status_atomically(monkeypatch, bills):
    existing = {"id": "bill-1", "status": "aberto"}
    find = AsyncMock(return_value=existing)
    update = AsyncMock(return_value=None)  # Another cashier settled the bill meanwhile.
    bills.find_one = find
    bills.find_one_and_update = update
    monkeypatch.setattr(finance, "_category_name", AsyncMock(return_value="Aluguel"))
    body = type("BillEdit", (), {
        "kind": "pagar", "category_id": "cat-1",
        "model_dump": lambda self, **kwargs: {"kind": "pagar", "category_id": "cat-1", "amount": 50},
    })()
    with pytest.raises(HTTPException) as error:
        await finance.update_bill("bill-1", body, {"role": "admin"})
    assert error.value.status_code == 409
    assert update.await_args.args[0] == {"id": "bill-1", "status": "aberto"}


async def test_recurring_bill_retries_after_partial_write(monkeypatch):
    from models.schemas import BillIn

    saved = {}
    fail_once = True

    async def upsert(query, update, *, upsert):
        nonlocal fail_once
        if saved and fail_once:
            fail_once = False
            raise ConnectionError("conexão interrompida")
        saved.setdefault(query["_id"], update["$setOnInsert"])

    async def find(query, projection):
        return saved.get(query.get("id") or query["_id"])

    monkeypatch.setattr(finance, "db", SimpleNamespace(bills=SimpleNamespace(update_one=upsert, find_one=find)))
    body = BillIn(kind="pagar", description="Aluguel", amount=500, due_date="2026-01-31",
                  repeat_months=3, client_ref="monthly-rent", cost_center="Salão")
    admin = {"id": "admin", "name": "Admin"}
    with pytest.raises(ConnectionError):
        await finance.create_bill(body, admin)
    created = await finance.create_bill(body, admin)
    assert await finance.create_bill(body, admin) == created
    assert len(saved) == 3
    assert [bill["due_date"] for bill in created] == ["2026-01-31", "2026-02-28", "2026-03-31"]
    with pytest.raises(HTTPException, match="Referência já usada"):
        await finance.create_bill(body.model_copy(update={"amount": 600}), admin)
