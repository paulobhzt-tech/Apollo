"""Regression tests: replaying an offline sale must never acknowledge an unpaid order."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from routers import operations


@pytest.fixture(autouse=True)
def isolated_database(monkeypatch):
    # Motor creates collection handles dynamically; patching a temporary handle
    # does not intercept the next db.orders access.
    monkeypatch.setattr(operations, "db", SimpleNamespace(
        orders=SimpleNamespace(find_one=AsyncMock(), delete_one=AsyncMock()),
        invoices=SimpleNamespace(find_one=AsyncMock()),
    ))


def sale_body():
    return operations.QuickSaleIn(client_ref="pc-1-sale-1", items=[{"product_id": "p1", "qty": 1}],
                                  payments=[{"method": "dinheiro", "amount": 10}],
                                  send_to_kitchen=False, emit_invoice=False)


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


@pytest.mark.asyncio
async def test_replay_does_not_expose_another_cashiers_sale(monkeypatch):
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value={
        "id": "order-1", "status": "pago", "waiter_id": "other-cashier"
    }))
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier", "role": "caixa"})
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_review_replay_from_another_operator(monkeypatch):
    order = {"id": "order-1", "status": "pago", "waiter_id": "other-cashier"}
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=order))
    assert (await operations.quick_sale(sale_body(), {"id": "admin", "name": "Admin", "role": "admin"}))["order"] == order


@pytest.mark.asyncio
async def test_counter_sale_records_actor_without_credentials(monkeypatch):
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=None))
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "cash-1"}))
    monkeypatch.setattr(operations, "build_items", AsyncMock(return_value=[]))
    create = AsyncMock(return_value={"id": "order-1", "number": 1})
    monkeypatch.setattr(operations, "new_order", create)
    monkeypatch.setattr(operations, "finalize_payment", AsyncMock(return_value=({"id": "order-1", "number": 1}, None)))
    monkeypatch.setattr(operations, "move_stock", AsyncMock())
    await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier", "pin_hash": "secret"})
    event = create.call_args.kwargs["audit_events"][0]
    assert event["actor_id"] == "cashier"
    assert event["client_ref"] == "pc-1-sale-1"
    assert "secret" not in str(event)


@pytest.mark.asyncio
async def test_replay_rejects_changed_payment_or_items(monkeypatch):
    original = sale_body()
    order = {"id": "order-1", "status": "pago", "waiter_id": "cashier",
             "request_fingerprint": operations.sale_fingerprint(original)}
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=order))
    changed = original.model_copy(update={"discount": 1})
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(changed, {"id": "cashier", "name": "Cashier", "role": "caixa"})
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_replay_same_request_with_fingerprint_is_idempotent(monkeypatch):
    body = sale_body()
    order = {"id": "order-1", "status": "pago", "waiter_id": "cashier",
             "request_fingerprint": operations.sale_fingerprint(body)}
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=order))
    assert (await operations.quick_sale(body, {"id": "cashier", "name": "Cashier"}))["order"] == order
