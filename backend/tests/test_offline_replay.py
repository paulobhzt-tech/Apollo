"""Regression tests: replaying an offline sale must never acknowledge an unpaid order."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from routers import operations


def sale_body():
    return SimpleNamespace(client_ref="pc-1-sale-1", items=[], customer_name=None,
                           customer_cpf=None, send_to_kitchen=False)


@pytest.mark.asyncio
async def test_offline_replay_existing_unpaid_order_is_retryable(monkeypatch):
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value={
        "id": "order-1", "status": "aberto", "client_ref": "pc-1-sale-1"
    }))
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier"})
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_offline_replay_paid_order_is_idempotent(monkeypatch):
    order = {"id": "order-1", "status": "pago", "client_ref": "pc-1-sale-1"}
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=order))
    result = await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier"})
    assert result == {"order": order, "invoice": None}


@pytest.mark.asyncio
async def test_offline_concurrent_duplicate_is_retryable(monkeypatch):
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=None))
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "cash-1"}))
    monkeypatch.setattr(operations, "build_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(operations, "new_order", AsyncMock(side_effect=DuplicateKeyError("duplicate client_ref")))
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier"})
    assert error.value.status_code == 409
