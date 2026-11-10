"""Isolated payment and permission regressions; no live payments or database."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from lib import orders
from lib.auth import require
from models.schemas import PayIn, Payment


@pytest.fixture
def payment_context(monkeypatch):
    order = {
        "id": "simulated-order", "number": 1, "status": "aberto",
        "items": [{"qty": 2, "unit_price": 10, "unit_cost": 4},
                  {"qty": 10, "unit_price": 99, "cancelled": True}],
    }
    saved = deepcopy(order)

    async def update(_query, change):
        saved.update(change["$set"])
        return SimpleNamespace(modified_count=1)

    collection = SimpleNamespace(update_one=AsyncMock(side_effect=update),
                                 find_one=AsyncMock(side_effect=lambda *_a, **_k: deepcopy(saved)))
    methods = Mock()
    methods.find.return_value.to_list = AsyncMock(return_value=[])
    monkeypatch.setattr(orders, "db", SimpleNamespace(orders=collection, payment_methods=methods))
    monkeypatch.setattr(orders, "current_cash", AsyncMock(return_value={"id": "simulated-cash"}))
    invoice = AsyncMock()
    monkeypatch.setattr(orders, "emit_invoice", invoice)
    return order, collection, methods, invoice


@pytest.mark.asyncio
async def test_cash_payment_reconciles_change_discount_service_and_cost(payment_context):
    order, collection, _, invoice = payment_context
    paid, fiscal = await orders.finalize_payment(order, PayIn(
        payments=[Payment(method="dinheiro", amount=30)], discount=2,
        service_pct=10, emit_invoice=False))
    assert paid["status"] == "pago"
    assert paid["subtotal"] == 20
    assert paid["service_fee"] == 2
    assert paid["total"] == 20
    assert paid["change"] == 10
    assert paid["cmv"] == 8
    assert paid["cash_session_id"] == "simulated-cash"
    assert orders.method_totals([paid])["dinheiro"] == 20
    assert fiscal is None
    invoice.assert_not_awaited()
    collection.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_split_simulated_payment_preserves_methods_and_brand(payment_context):
    order, _, _, _ = payment_context
    paid, _ = await orders.finalize_payment(order, PayIn(payments=[
        Payment(method="pix", amount=5),
        Payment(method="credito", amount=15, brand="visa"),
    ], emit_invoice=False))
    assert orders.method_totals([paid], with_brand=True) == {"pix": 5, "credito:visa": 15}
    assert paid["change"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("payments,discount,expected", [
    ([Payment(method="dinheiro", amount=19)], 0, "insuficiente"),
    ([Payment(method="pix", amount=30)], 0, "Troco"),
    ([Payment(method="credito", amount=20)], 0, "bandeira"),
    ([Payment(method="dinheiro", amount=30)], 21, "Desconto"),
])
async def test_invalid_payment_never_writes(payment_context, payments, discount, expected):
    order, collection, _, invoice = payment_context
    with pytest.raises(HTTPException) as exc:
        await orders.finalize_payment(order, PayIn(payments=payments, discount=discount, emit_invoice=False))
    assert exc.value.status_code == 400
    assert expected in exc.value.detail
    collection.update_one.assert_not_awaited()
    invoice.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabled_method_never_settles(payment_context):
    order, collection, methods, _ = payment_context
    methods.find.return_value.to_list.return_value = [{"key": "pix", "active": False, "name": "PIX"}]
    with pytest.raises(HTTPException) as exc:
        await orders.finalize_payment(order, PayIn(payments=[Payment(method="pix", amount=20)], emit_invoice=False))
    assert exc.value.status_code == 400
    assert "desativada" in exc.value.detail
    collection.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_closed_cash_never_settles(payment_context, monkeypatch):
    order, collection, _, _ = payment_context
    monkeypatch.setattr(orders, "current_cash", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as exc:
        await orders.finalize_payment(order, PayIn(payments=[Payment(method="dinheiro", amount=20)], emit_invoice=False))
    assert "Caixa fechado" in exc.value.detail
    collection.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_already_paid_order_cannot_be_charged_again(payment_context):
    order, collection, _, _ = payment_context
    order["status"] = "pago"
    with pytest.raises(HTTPException) as exc:
        await orders.finalize_payment(order, PayIn(payments=[Payment(method="dinheiro", amount=20)], emit_invoice=False))
    assert exc.value.status_code == 400
    collection.update_one.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["garcom", "cozinha", "cliente"])
async def test_only_cashier_and_admin_can_receive(role):
    with pytest.raises(HTTPException) as exc:
        await require("caixa")({"id": "simulated-user", "role": role})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["caixa", "admin"])
async def test_cashier_and_admin_can_receive(role):
    user = {"id": "simulated-user", "role": role}
    assert await require("caixa")(user) is user


@pytest.mark.asyncio
async def test_cashier_cannot_access_admin_backup_dependency():
    with pytest.raises(HTTPException) as exc:
        await require()({"role": "caixa"})
    assert exc.value.status_code == 403
