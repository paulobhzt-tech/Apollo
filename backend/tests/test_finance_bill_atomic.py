"""Regression tests for atomic settlement of accounts payable/receivable."""
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import finance


@pytest.mark.asyncio
async def test_pay_bill_only_updates_open_bill(monkeypatch):
    update = AsyncMock(return_value={"id": "bill-1", "status": "pago"})
    monkeypatch.setattr(finance.db.bills, "find_one_and_update", update)
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
    await finance.reopen_bill("bill-1", {"role": "admin"})
    assert update.await_args.args[0]["status"] == {"$in": ["pago", "cancelado"]}
