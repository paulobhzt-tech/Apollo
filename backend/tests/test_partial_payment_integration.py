"""Integration tests against a real MongoDB replica set (never production data)."""
import asyncio
import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")
from fastapi import HTTPException

from lib.db import db
from lib.orders import method_totals
from models.schemas import Order, OrderItem, PayIn, Payment, Table
from routers.tables import PartialPaymentIn, pay_partial_bill


@pytest.fixture
def scenario():
    prefix = uuid.uuid4().hex
    table = Table(id=f"table-{prefix}", number=777, status="ocupada",
                  order_id=f"open-{prefix}", total=50).model_dump()
    order = Order(id=f"open-{prefix}", number=777, channel="mesa", source="mesa",
                  table_id=table["id"], table_number=777,
                  items=[OrderItem(id=f"item-{prefix}", product_id="test", name="Espetinho",
                                   qty=5, unit_price=10, unit_cost=4)],
                  subtotal=50, total=50).model_dump()
    return table, order


async def test_partial_payment_replay_and_cash_reconciliation(scenario):
    table, order = scenario
    cash_id = "cash-" + uuid.uuid4().hex
    await db.tables.insert_one(table)
    await db.orders.insert_one(order)
    await db.cash_sessions.insert_one({"id": cash_id, "status": "aberto"})
    try:
        body = PartialPaymentIn(
            quantities={order["items"][0]["id"]: 2},
            client_ref="partial-" + uuid.uuid4().hex,
            payment=PayIn(payments=[Payment(method="dinheiro", amount=25)],
                          discount=2, service_pct=10, emit_invoice=False))
        result = await pay_partial_bill(table["id"], body, {})
        paid = result["order"]
        assert paid["status"] == "pago"
        assert paid["subtotal"] == 20
        assert paid["discount"] == 2
        assert paid["service_fee"] == 2
        assert paid["total"] == 20
        assert paid["change"] == 5
        assert paid["cmv"] == 8
        assert method_totals([paid])["dinheiro"] == 20
        remaining = await db.orders.find_one({"id": order["id"]})
        assert remaining["status"] == "aberto"
        assert remaining["items"][0]["qty"] == 3
        assert remaining["total"] == 30
        assert (await db.tables.find_one({"id": table["id"]}))["order_id"] == order["id"]
        replay = await pay_partial_bill(table["id"], body, {})
        assert replay["order"]["id"] == paid["id"]
        assert await db.orders.count_documents({"client_ref": body.client_ref}) == 1
        assert (await db.orders.find_one({"id": order["id"]}))["total"] == 30
        changed = body.model_copy(update={"quantities": {order["items"][0]["id"]: 1}})
        with pytest.raises(HTTPException) as changed_error:
            await pay_partial_bill(table["id"], changed, {})
        assert changed_error.value.status_code == 409
        with pytest.raises(HTTPException) as wrong_table:
            await pay_partial_bill("other-table", body, {})
        assert wrong_table.value.status_code == 409
        # Attempt to pay more than the remaining quantity: no new sale.
        body2 = PartialPaymentIn(quantities={order["items"][0]["id"]: 4},
                                 client_ref="partial-" + uuid.uuid4().hex,
                                 payment=PayIn(payments=[Payment(method="pix", amount=40)], emit_invoice=False))
        with pytest.raises(HTTPException) as err:
            await pay_partial_bill(table["id"], body2, {})
        assert err.value.status_code == 400
        assert await db.orders.count_documents({"parent_order_id": order["id"]}) == 1
    finally:
        await db.orders.delete_many({"$or": [{"id": order["id"]}, {"parent_order_id": order["id"]}]})
        await db.tables.delete_one({"id": table["id"]})
        await db.cash_sessions.delete_one({"id": cash_id})


@pytest.mark.asyncio(loop_scope="session")
async def test_concurrent_partial_payments_cannot_oversell(scenario):
    table, order = scenario
    cash_id = "cash-" + uuid.uuid4().hex
    await db.tables.insert_one(table)
    await db.orders.insert_one(order)
    await db.cash_sessions.insert_one({"id": cash_id, "status": "aberto"})
    try:
        def request():
            return PartialPaymentIn(quantities={order["items"][0]["id"]: 4},
                                    client_ref="partial-" + uuid.uuid4().hex,
                                    payment=PayIn(payments=[Payment(method="pix", amount=40)], emit_invoice=False))
        results = await asyncio.gather(pay_partial_bill(table["id"], request(), {}),
                                       pay_partial_bill(table["id"], request(), {}),
                                       return_exceptions=True)
        successes = [r for r in results if isinstance(r, dict)]
        assert len(successes) == 1, results
        assert await db.orders.count_documents({"parent_order_id": order["id"]}) == 1
        remaining = await db.orders.find_one({"id": order["id"]})
        assert remaining["items"][0]["qty"] == 1
        assert remaining["total"] == 10
    finally:
        await db.orders.delete_many({"$or": [{"id": order["id"]}, {"parent_order_id": order["id"]}]})
        await db.tables.delete_one({"id": table["id"]})
        await db.cash_sessions.delete_one({"id": cash_id})


async def test_concurrent_purchases_and_transaction_rollback(monkeypatch):
    from models.schemas import PurchaseIn
    from routers import catalog

    if db.name not in {"apollo_partial_payment_ci", "apollo_partial_ci"}:
        pytest.skip("Compra concorrente exige o banco descartável da CI")
    prefix = "purchase-test-" + uuid.uuid4().hex
    supplier_id = f"{prefix}-supplier"
    ingredient_id = f"{prefix}-ingredient"
    await db.suppliers.insert_one({"id": supplier_id, "name": "Fornecedor fictício"})
    await db.ingredients.insert_one({"id": ingredient_id, "name": "Insumo fictício",
                                    "unit": "kg", "stock": 1, "cost_per_unit": 10})
    actor = {"id": prefix, "name": "Operador fictício"}

    def purchase(ref, qty, cost):
        return PurchaseIn(supplier_id=supplier_id, ingredient_id=ingredient_id,
                          qty=qty, unit_cost=cost, client_ref=f"{prefix}-{ref}")

    try:
        first = purchase("first", 0.5, 20)
        second = purchase("second", 0.5, 20)
        result = await asyncio.gather(catalog.register_purchase(first, actor),
                                      catalog.register_purchase(first, actor),
                                      catalog.register_purchase(second, actor))
        assert result[0]["id"] == result[1]["id"] != result[2]["id"]
        ingredient = await db.ingredients.find_one({"id": ingredient_id})
        assert ingredient["stock"] == 2
        assert ingredient["cost_per_unit"] == pytest.approx(15, abs=0.0001)
        assert await db.purchases.count_documents({"ingredient_id": ingredient_id}) == 2
        assert await db.stock_moves.count_documents({"ingredient_id": ingredient_id}) == 2

        original = catalog.apply_purchase
        async def fail_after_write(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError("Falha fictícia após as gravações")

        monkeypatch.setattr(catalog, "apply_purchase", fail_after_write)
        with pytest.raises(RuntimeError, match="Falha fictícia"):
            await catalog.register_purchase(purchase("rollback", 1, 30), actor)
        ingredient = await db.ingredients.find_one({"id": ingredient_id})
        assert ingredient["stock"] == 2
        assert await db.purchases.count_documents({"ingredient_id": ingredient_id}) == 2
        assert await db.stock_moves.count_documents({"ingredient_id": ingredient_id}) == 2
    finally:
        await db.stock_moves.delete_many({"ingredient_id": ingredient_id})
        await db.purchases.delete_many({"ingredient_id": ingredient_id})
        await db.ingredients.delete_one({"id": ingredient_id})
        await db.suppliers.delete_one({"id": supplier_id})
