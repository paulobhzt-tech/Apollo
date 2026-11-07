"""Regression tests for atomic settlement of accounts payable/receivable."""
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import finance


@pytest.mark.asyncio
async def test_pay_bill_only_updates_open_bill(monkeypatch):
    update = AsyncMock(return_value={"id": "bill-1", "status": "pago"})
    monkeypatch.setattr(finance.db.bills, "find_one_and_update", update)
    monkeypatch.setattr(finance, "audit_bill_change", AsyncMock())
    body = type("Payment", (), {"model_dump": lambda self: {"paid_amount": 42.0}})()
    result = await finance.pay_bill("bill-1", body, {"role": "caixa"})
    assert result["status"] == "pago"
    query = update.await_args.args[0]
    assert query == {"id": "bill-1", "status": "aberto"}


@pytest.mark.asyncio
async def test_pay_bill_rejects_duplicate_settlement(monkeypatch):
    monkeypatch.setattr(finance.db.bills, "find_one_and_update", AsyncMock(return_value=None))
    monkeypatch.setattr(finance.db.bills, "find_one", AsyncMock(return_value={"status": "pago"}))
    body = type("Payment", (), {"model_dump": lambda self: {"paid_amount": 42.0}})()
    with pytest.raises(HTTPException) as error:
        await finance.pay_bill("bill-1", body, {"role": "caixa"})
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_reopen_only_closed_bills(monkeypatch):
    update = AsyncMock(return_value={"id": "bill-1", "status": "aberto"})
    monkeypatch.setattr(finance.db.bills, "find_one_and_update", update)
    monkeypatch.setattr(finance, "audit_bill_change", AsyncMock())
    await finance.reopen_bill("bill-1", {"role": "admin"})
    assert update.await_args.args[0]["status"] == {"$in": ["pago", "cancelado"]}


@pytest.mark.asyncio
async def test_financial_audit_contains_actor_and_no_credentials(monkeypatch):
    from types import SimpleNamespace
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
async def test_delete_bill_rejects_settled_record(monkeypatch):
    from types import SimpleNamespace
    deleted = AsyncMock(return_value=SimpleNamespace(deleted_count=0))
    monkeypatch.setattr(finance.db.bills, "delete_one", deleted)
    monkeypatch.setattr(finance.db.bills, "find_one", AsyncMock(return_value={"status": "pago"}))
    with pytest.raises(HTTPException) as error:
        await finance.delete_bill("bill-1", {"role": "admin"})
    assert error.value.status_code == 409
    assert deleted.await_args.args[0] == {"id": "bill-1", "status": "aberto"}


@pytest.mark.asyncio
async def test_cancel_bill_records_audit_event(monkeypatch):
    cancelled = {"id": "bill-1", "kind": "pagar", "status": "cancelado"}
    update = AsyncMock(return_value=cancelled)
    audit = AsyncMock()
    monkeypatch.setattr(finance.db.bills, "find_one_and_update", update)
    monkeypatch.setattr(finance, "audit_bill_change", audit)
    actor = {"id": "admin-1", "name": "Admin", "role": "admin"}
    result = await finance.cancel_bill("bill-1", actor)
    assert result["status"] == "cancelado"
    assert update.await_args.args[0] == {"id": "bill-1", "status": "aberto"}
    audit.assert_awaited_once_with("cancelled", actor, cancelled)
