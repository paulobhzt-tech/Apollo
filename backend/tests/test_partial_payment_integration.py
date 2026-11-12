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


async def test_counter_payment_rolls_back_on_insufficient_stock_and_retries(monkeypatch):
    from models.schemas import CancelIn, QuickSaleIn
    from routers import operations
    from lib.orders import now

    if db.name not in {"apollo_partial_payment_ci", "apollo_partial_ci"}:
        pytest.skip("Venda transacional exige a réplica descartável da CI")
    prefix = "counter-stock-" + uuid.uuid4().hex
    product_id = prefix + "-product"
    ingredient_id = prefix + "-ingredient"
    cash_id = prefix + "-cash"
    actor = {"id": prefix, "name": "Caixa fictício", "role": "admin"}
    await db.orders.create_index("client_ref", unique=True,
                                 partialFilterExpression={"client_ref": {"$type": "string"}})
    await db.ingredients.insert_one({"id": ingredient_id, "name": "Teste", "stock": 0,
                                    "unit": "kg", "cost_per_unit": 2})
    await db.products.insert_one({"id": product_id, "name": "Produto fictício", "active": True,
                                 "category_id": prefix, "price": 20, "sale_unit": "kg",
                                 "recipe": [{"ingredient_id": ingredient_id, "qty": 1}]})
    await db.cash_sessions.insert_one({"id": cash_id, "status": "aberto"})
    body = QuickSaleIn(client_ref=prefix, items=[{"product_id": product_id, "qty": 0.25}, {"product_id": product_id, "qty": 0.25}],
                       payments=[{"method": "dinheiro", "amount": 10}], emit_invoice=False, send_to_kitchen=False)
    try:
        with pytest.raises(HTTPException) as error:
            await operations.quick_sale(body, actor)
        assert error.value.status_code == 409
        assert await db.orders.count_documents({"client_ref": prefix}) == 0
        assert await db.stock_moves.count_documents({"ingredient_id": ingredient_id}) == 0

        await db.ingredients.update_one({"id": ingredient_id}, {"$set": {"stock": 1}})
        await db.purchases.insert_one({"id": prefix + "-lot", "ingredient_id": ingredient_id,
                                       "remaining_qty": 0.75, "expiry_date": "2099-01-01", "created_at": now()})
        paid = await operations.quick_sale(body, actor)
        replay = await operations.quick_sale(body, actor)
        assert paid["order"]["id"] == replay["order"]["id"]
        assert replay["order"]["stock_completion"] == "complete"
        assert (await db.ingredients.find_one({"id": ingredient_id}))["stock"] == 0.5
        assert await db.stock_moves.count_documents({"ingredient_id": ingredient_id}) == 1
        order = paid["order"]
        lot = await db.purchases.find_one({"id": prefix + "-lot"})
        assert lot["remaining_qty"] == 0.25
        original = operations.move_stock

        async def fail_after_stock(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError("falha fictícia de estorno")

        with monkeypatch.context() as patch:
            patch.setattr(operations, "move_stock", fail_after_stock)
            with pytest.raises(RuntimeError, match="falha fictícia"):
                await operations.refund_item(order["id"], order["items"][0]["id"],
                                             CancelIn(reason="teste de rollback"), actor)
        assert (await db.purchases.find_one({"id": prefix + "-lot"}))["remaining_qty"] == 0.25
        assert (await db.orders.find_one({"id": order["id"]}))["refunds"] == []
        await operations.refund_item(order["id"], order["items"][0]["id"],
                                     CancelIn(reason="estorno parcial fictício"), actor)
        assert (await db.purchases.find_one({"id": prefix + "-lot"}))["remaining_qty"] == 0.5
        await operations.cancel_order(order["id"], CancelIn(reason="estorno total fictício"), actor)
        assert (await db.purchases.find_one({"id": prefix + "-lot"}))["remaining_qty"] == 0.75
        assert (await db.ingredients.find_one({"id": ingredient_id}))["stock"] == 1
    finally:
        await db.lot_consumptions.delete_many({"ingredient_id": ingredient_id})
        await db.purchases.delete_many({"ingredient_id": ingredient_id})
        await db.orders.delete_many({"client_ref": prefix})
        await db.stock_moves.delete_many({"ingredient_id": ingredient_id})
        await db.cash_sessions.delete_one({"id": cash_id})
        await db.products.delete_one({"id": product_id})
        await db.ingredients.delete_one({"id": ingredient_id})


async def test_delivery_stock_failure_rolls_back_and_concurrent_retry_is_idempotent(monkeypatch):
    from unittest.mock import AsyncMock

    from models.schemas import DeliveryStatusIn
    from routers import operations

    order = Order(number=779, channel="delivery", source="cardapio", delivery_status="pendente").model_dump()
    await db.orders.insert_one(dict(order))
    ticket = AsyncMock()
    stock = AsyncMock(side_effect=HTTPException(409, "Estoque fictício insuficiente"))
    monkeypatch.setattr(operations, "create_ticket", ticket)
    monkeypatch.setattr(operations, "move_stock", stock)
    actor = {"id": "test", "name": "Caixa de teste"}
    body = DeliveryStatusIn(status="aceito")
    try:
        with pytest.raises(HTTPException, match="Estoque fictício insuficiente"):
            await operations.delivery_status(order["id"], body, actor)
        saved = await db.orders.find_one({"id": order["id"]})
        assert saved["delivery_status"] == "pendente"
        assert saved.get("stock_completion") != "pending"
        stock.side_effect = None
        stock.reset_mock()
        accepted = await asyncio.gather(*(operations.delivery_status(order["id"], body, actor) for _ in range(2)))
        assert [row["stock_completion"] for row in accepted] == ["complete", "complete"]
        stock.assert_awaited_once()
    finally:
        await db.orders.delete_one({"id": order["id"]})
