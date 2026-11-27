"""Monetary receipts, checkout and cash reconciliation on disposable MongoDB."""
import asyncio
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException

from lib.db import db
from models.schemas import CashCloseIn, CancelIn, Order, OrderItem, Table, TablePayIn
from routers.operations import cash_close, cash_summary, cancel_order, refund_item
from routers.tables import (
    MonetaryReceiptIn, MonetaryReversalIn, pay_table,
    receive_monetary_partial, reverse_monetary_partial,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(loop_scope="session")
async def counter(monkeypatch):
    assert db.name.startswith(("apollo_partial_ci", "apollo_restore_test_"))
    monkeypatch.setenv("APOLLO_CASH_MODE", "operator")
    token = uuid4().hex
    users = [{"id": f"{token}-{suffix}", "name": name, "role": "admin"}
             for suffix, name in (("a", "Caixa A"), ("b", "Caixa B"))]
    shifts = [{"id": f"cash-{user['id']}", "opened_by_id": user["id"], "status": "aberto",
               "opening_amount": 0, "movements": []} for user in users]
    table = Table(id=f"table-{token}", number=9230, status="ocupada", order_id=token, total=50).model_dump()
    order = Order(id=token, number=9230, channel="mesa", source="mesa", table_id=table["id"],
                  items=[OrderItem(id="a", product_id="fixture", name="Item A", qty=1, unit_price=30, stock_recipe=[]),
                         OrderItem(id="b", product_id="fixture", name="Item B", qty=1, unit_price=20, stock_recipe=[])],
                  subtotal=50, total=50).model_dump()
    await db.tables.insert_one(table)
    await db.orders.insert_one(order)
    await db.cash_sessions.insert_many(shifts)
    try:
        yield users, shifts, table, order
    finally:
        await db.cash_adjustments.delete_many({"order_id": token})
        await db.orders.delete_one({"id": token})
        await db.tables.delete_one({"id": table["id"]})
        await db.cash_sessions.delete_many({"id": {"$in": [s["id"] for s in shifts]}})


def receipt(order, *, amount, expected=50, mode="amount", value=None, method="dinheiro", details=None):
    return MonetaryReceiptIn(mode=mode, value=value if value is not None else amount, expected_order_id=order["id"],
                             expected_balance=expected, client_ref=uuid4().hex,
                             payments=[{"method": method, "amount": amount, "details": details}])


async def test_two_independent_receipts_and_final_sale_across_registers(counter):
    (a, b), (cash_a, cash_b), table, order = counter
    snap = await db.stock_moves.count_documents({})
    first = receipt(order, amount=12.5, mode="percentage", value=25)
    result = await receive_monetary_partial(table["id"], first, a)
    assert result["amount"] == 12.5
    assert await receive_monetary_partial(table["id"], first, a) == result
    with pytest.raises(HTTPException, match="Referência"):
        await receive_monetary_partial(table["id"], first.model_copy(update={"value": 24}), a)
    assert (await db.tables.find_one({"id": table["id"]}))["total"] == 37.5
    assert (await cash_summary(dict(cash_a)))["expected_cash"] == 12.5
    assert (await cash_summary(dict(cash_a)))["sales_count"] == 0
    closed = await cash_close(CashCloseIn(counted_amount=12.5), a)
    assert closed["difference"] == 0

    second = receipt(order, amount=7.5, expected=37.5)
    await receive_monetary_partial(table["id"], second, b)
    close = TablePayIn(expected_order_id=order["id"], expected_advance_paid=20,
                       payments=[{"method": "dinheiro", "amount": 35}], emit_invoice=False)
    with pytest.raises(HTTPException, match="Recebimentos alterados"):
        await pay_table(table["id"], close.model_copy(update={"expected_advance_paid": 12.5}), b)
    sold = (await pay_table(table["id"], close, b))["order"]
    assert sold["total"] == 50 and sold["change"] == 5
    assert len(sold["items"]) == 2 and len(sold["payments"]) == 3
    assert [e["action"] for e in sold["audit_events"]].count("table_receipt_recorded") == 2
    assert await receive_monetary_partial(table["id"], first, a) == result
    summary = await cash_summary(dict(cash_b))
    assert summary["expected_cash"] == 37.5 and summary["sales_total"] == 50
    assert await db.stock_moves.count_documents({}) == snap

    await refund_item(order["id"], "a", CancelIn(reason="Estorno fictício"), b)
    assert (await cash_summary(dict(cash_b)))["expected_cash"] == 7.5
    await cancel_order(order["id"], CancelIn(reason="Cancelamento fictício"), b)
    assert (await cash_summary(dict(cash_b)))["expected_cash"] == -12.5
    assert (await cash_summary(closed))["expected_cash"] == 12.5


async def test_concurrent_receipts_and_idempotent_reversal(counter):
    (a, b), (cash_a, cash_b), table, order = counter
    request_a, request_b = receipt(order, amount=20), receipt(order, amount=30)
    args = [(request_a, a), (request_b, b)]
    results = await asyncio.gather(*[
        receive_monetary_partial(table["id"], request, user) for request, user in args
    ], return_exceptions=True)
    winner = next(i for i in range(2) if isinstance(results[i], dict))
    assert isinstance(results[1 - winner], HTTPException) and results[1 - winner].status_code == 409
    assert await db.cash_adjustments.count_documents({"order_id": order["id"]}) == 1
    with pytest.raises(HTTPException, match="Estorne os recebimentos"):
        await cancel_order(order["id"], CancelIn(reason="Cancelamento fictício"), a)

    winning_request, winning_user = args[winner]
    reversal = MonetaryReversalIn(expected_order_id=order["id"], reason="Devolução fictícia")
    result = await reverse_monetary_partial(table["id"], results[winner]["id"], reversal, winning_user)
    assert await reverse_monetary_partial(table["id"], result["id"], reversal, winning_user) == result
    assert await receive_monetary_partial(table["id"], winning_request, winning_user) == result
    assert (await db.tables.find_one({"id": table["id"]}))["total"] == 50
    assert await db.cash_adjustments.count_documents({"order_id": order["id"]}) == 2
    for cash in (cash_a, cash_b):
        assert (await cash_summary(dict(cash)))["expected_cash"] == 0


async def test_parallel_replay_and_duplicate_pix_reference(counter):
    (a, _), (cash_a, _), table, order = counter
    details = {"reference": "Test-Pix-42", "pix_received": True}
    request = receipt(order, amount=20, method="pix", details=details)
    one, two = await asyncio.gather(*[receive_monetary_partial(table["id"], request, a) for _ in range(2)])
    assert one == two
    changed = receipt(order, amount=10, expected=30, method="pix", details=details)
    with pytest.raises(HTTPException, match="Referência PIX"):
        await receive_monetary_partial(table["id"], changed, a)
    assert (await cash_summary(dict(cash_a)))["totals_by_method"] == {"pix": 20.0}
    assert await db.cash_adjustments.count_documents({"order_id": order["id"]}) == 1
