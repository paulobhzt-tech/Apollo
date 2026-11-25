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
        orders=SimpleNamespace(find_one=AsyncMock(), delete_one=AsyncMock(), update_one=AsyncMock()),
        command=AsyncMock(return_value={}),
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
    assert event["correlation"] == "pc-1-sale-1"
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


@pytest.mark.asyncio
async def test_payment_failure_cleanup_cannot_delete_a_paid_sale(monkeypatch):
    monkeypatch.setattr(operations.db.orders, "find_one", AsyncMock(return_value=None))
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "cash-1"}))
    monkeypatch.setattr(operations, "build_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(operations, "new_order", AsyncMock(return_value={"id": "order-1", "number": 1}))
    monkeypatch.setattr(operations, "finalize_payment", AsyncMock(side_effect=HTTPException(400, "Falha fiscal")))
    with pytest.raises(HTTPException):
        await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Cashier"})
    operations.db.orders.delete_one.assert_awaited_once_with({"id": "order-1", "status": "aberto"})


def test_payment_details_keep_legacy_sale_fingerprint_compatible():
    import hashlib
    import json
    from models.schemas import PaymentDetails

    body = sale_body()
    legacy = body.model_dump(mode="json", exclude={"client_ref", "sync_context", "discount_reason", "expected_cash_session_id"})
    for payment in legacy["payments"]:
        del payment["details"]
    expected = hashlib.sha256(json.dumps(legacy, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    assert operations.sale_fingerprint(body) == expected
    body.payments[0].details = PaymentDetails(reference="TEST-REF")
    assert operations.sale_fingerprint(body) != expected
    body.payments[0].details = None
    body.expected_cash_session_id = "original-shift"
    bound = operations.sale_fingerprint(body)
    assert bound != expected
    body.expected_cash_session_id = "different-shift"
    assert operations.sale_fingerprint(body) != bound


def test_card_metadata_is_optional_validated_and_auditable():
    import json
    from pydantic import ValidationError
    from lib.orders import card_payment_audit
    from models.schemas import Payment

    legacy_details = {"reference": "REF", "note": "", "pix_key_label": "", "pix_received": False}
    legacy = Payment(method="credito", amount=10, brand="visa", details=legacy_details)
    assert legacy.model_dump()["details"] == legacy_details

    card = Payment(method="debito", amount=10, brand="visa",
                   details={"pos_terminal": " Caixa 1 ", "authorization_code": "A-1", "nsu": "000012"})
    assert card.model_dump()["details"]["nsu"] == "000012"
    assert card.details.pos_terminal == "Caixa 1"
    body = sale_body()
    body.payments = [card]
    assert json.loads(card_payment_audit(body)["card_transactions"]) == [
        {"index": 0, "method": "debito", "pos_terminal": "Caixa 1", "authorization_code": "A-1", "nsu": "000012"},
    ]
    fingerprint = operations.sale_fingerprint(body)
    card.details.nsu = "000013"
    assert operations.sale_fingerprint(body) != fingerprint

    with pytest.raises(ValidationError):
        Payment(method="pix", amount=10, details={"nsu": "012"})
    with pytest.raises(ValidationError):
        Payment(method="credito", amount=10, details={"authorization_code": "código com espaço"})


@pytest.mark.asyncio
async def test_paid_sale_with_pending_stock_cannot_be_acknowledged_as_complete():
    operations.db.orders.find_one.return_value = {
        "id": "existing", "status": "pago", "stock_completion": "pending",
    }
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(sale_body(), {"id": "cashier", "name": "Caixa"})
    assert error.value.status_code == 409
    assert "Não cobre novamente" in error.value.detail
    operations.db.orders.delete_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_concurrent_duplicate_returns_committed_sale_without_new_side_effects(monkeypatch):
    body = sale_body()
    order = {"id": "winner", "status": "pago", "stock_completion": "complete",
             "waiter_id": "cashier", "request_fingerprint": operations.sale_fingerprint(body)}
    operations.db.orders.find_one.side_effect = [None, order]
    create = AsyncMock(side_effect=DuplicateKeyError("duplicate client_ref"))
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "cash"}))
    monkeypatch.setattr(operations, "build_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(operations, "new_order", create)
    pay, stock = AsyncMock(), AsyncMock()
    monkeypatch.setattr(operations, "finalize_payment", pay)
    monkeypatch.setattr(operations, "move_stock", stock)
    result = await operations.quick_sale(body, {"id": "cashier", "name": "Cashier", "role": "caixa"})
    assert result == {"order": order, "invoice": None}
    create.assert_awaited_once()
    pay.assert_not_awaited()
    stock.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("updates", "expected"), [
    ({"waiter_id": "another-cashier"}, 403),
    ({"request_fingerprint": "different-body"}, 422),
    ({"status": "aberto"}, 409),
    ({"stock_completion": "pending"}, 409),
])
async def test_duplicate_race_preserves_authorization_and_completion_checks(monkeypatch, updates, expected):
    body = sale_body()
    order = {"id": "winner", "status": "pago", "stock_completion": "complete",
             "waiter_id": "cashier", "request_fingerprint": operations.sale_fingerprint(body), **updates}
    operations.db.orders.find_one.side_effect = [None, order]
    monkeypatch.setattr(operations, "current_cash", AsyncMock(return_value={"id": "cash"}))
    monkeypatch.setattr(operations, "build_items", AsyncMock(return_value=[]))
    monkeypatch.setattr(operations, "new_order", AsyncMock(side_effect=DuplicateKeyError("duplicate client_ref")))
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(body, {"id": "cashier", "name": "Cashier", "role": "caixa"})
    assert error.value.status_code == expected
