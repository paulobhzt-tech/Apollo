from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from lib.inventory_recovery import counter_stock_evidence
from models.schemas import DeliveryStatusIn
from routers import catalog, operations

ADMIN = {"id": "admin-test", "name": "Administrador de teste", "role": "admin"}


def test_evidence_rounds_each_stock_reference_and_detects_partial_writes():
    recipe = [{"ingredient_id": "flour", "qty": 0.0001}]
    order = {"items": [{"qty": 0.5, "stock_ref": key, "stock_recipe": recipe} for key in ("a", "b")]}
    move = {"ingredient_id": "flour", "qty": -0.0001}
    assert counter_stock_evidence(order, [move, move])["matches"]
    assert not counter_stock_evidence(order, [move])["matches"]
    assert not counter_stock_evidence({"items": [{"qty": 1}]}, [])["matches"]


@pytest.mark.asyncio
async def test_recovery_requires_current_preview_and_a_successful_conditional_write(monkeypatch):
    orders = SimpleNamespace(
        find_one=AsyncMock(return_value={"id": "sale", "number": 1, "status": "pago", "items": [{"qty": 1, "stock_recipe": []}]}),
        update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)),
    )
    stock_moves = SimpleNamespace(find=Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[]))))
    monkeypatch.setattr(catalog, "db", SimpleNamespace(orders=orders, stock_moves=stock_moves))
    preview = await catalog.preview_pending_sale("sale", ADMIN)
    orders.update_one.assert_not_awaited()
    approval = catalog.ReconciliationApproval(token=preview["token"], reason="Conferência fictícia", confirmed=False)
    with pytest.raises(HTTPException, match="Evidência insuficiente"):
        await catalog.approve_pending_sale("sale", approval, ADMIN)
    orders.update_one.assert_not_awaited()
    approval.confirmed = True
    assert await catalog.approve_pending_sale("sale", approval, ADMIN) == {"ok": True}
    query, update = orders.update_one.await_args.args
    assert query["stock_completion"] == "pending"
    assert update["$push"]["audit_events"]["correlation"] == preview["token"]
    orders.update_one.return_value.modified_count = 0
    with pytest.raises(HTTPException, match="Venda alterada"):
        await catalog.approve_pending_sale("sale", approval, ADMIN)


@pytest.mark.asyncio
async def test_standalone_delivery_retry_does_not_repeat_ambiguous_stock_write(monkeypatch):
    order = {"id": "delivery", "status": "aberto", "delivery_status": "pendente", "number": 2, "items": []}

    async def update(query, change):
        assert query["delivery_status"] == "pendente"
        order.update(change["$set"])
        return SimpleNamespace(modified_count=1)

    orders = SimpleNamespace(find_one=AsyncMock(side_effect=lambda *_: order.copy()), update_one=AsyncMock(side_effect=update))
    stock = AsyncMock(side_effect=RuntimeError("interrupção simulada"))
    monkeypatch.setattr(operations, "db", SimpleNamespace(orders=orders))
    monkeypatch.setattr(operations, "create_ticket", AsyncMock())
    monkeypatch.setattr(operations, "move_stock", stock)
    for _ in range(2):
        with pytest.raises(HTTPException, match="baixa pendente"):
            await operations.apply_delivery_status("delivery", DeliveryStatusIn(status="aceito"), ADMIN)
    assert order["stock_completion"] == "pending"
    stock.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancel_unaccepted_delivery_never_restocks(monkeypatch):
    from models.schemas import CancelIn

    order = {"id": "delivery", "status": "aberto", "channel": "delivery",
             "delivery_status": "pendente", "number": 2, "items": []}
    orders = SimpleNamespace(find_one=AsyncMock(return_value=order),
                             update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)))
    tickets = SimpleNamespace(update_many=AsyncMock())
    monkeypatch.setattr(operations, "db", SimpleNamespace(orders=orders, kitchen_tickets=tickets))
    stock = AsyncMock()
    monkeypatch.setattr(operations, "move_stock", stock)
    await operations.apply_cancel_order("delivery", CancelIn(reason="Cancelamento de teste"), ADMIN, ADMIN["name"])
    stock.assert_not_awaited()
    assert orders.update_one.await_args.args[0]["delivery_status"] == "pendente"


async def test_table_batch_recovery_requires_linked_stock_and_one_approval(monkeypatch):
    batch_id = "a" * 64
    batch = {"stage": "ticket_recorded", "complete": False, "item_ids": ["item"]}
    order = {"id": "order", "number": 8, "status": "aberto", "table_item_batches": {batch_id: batch},
             "items": [{"id": "item", "name": "Produto", "qty": 2, "stock_ref": "ref",
                        "stock_recipe": [{"ingredient_id": "ingredient", "qty": 1}]}]}
    orders = SimpleNamespace(find_one=AsyncMock(return_value=order),
                             update_one=AsyncMock(side_effect=[SimpleNamespace(modified_count=1),
                                                               SimpleNamespace(modified_count=0)]))
    cursor = SimpleNamespace(to_list=AsyncMock(return_value=[]))
    stock = SimpleNamespace(find=Mock(return_value=SimpleNamespace(sort=Mock(return_value=cursor))))
    monkeypatch.setattr(catalog, "db", SimpleNamespace(orders=orders, stock_moves=stock))
    preview = await catalog.preview_table_batch("order", batch_id, ADMIN)
    assert not preview["matches"]
    approval = catalog.ReconciliationApproval(token=preview["token"], reason="Conferência de teste", confirmed=True)
    with pytest.raises(HTTPException, match="Evidência insuficiente"):
        await catalog.approve_table_batch("order", batch_id, approval, ADMIN)
    orders.update_one.assert_not_awaited()

    cursor.to_list.return_value = [{"id": "move", "ingredient_id": "ingredient", "qty": -2}]
    preview = await catalog.preview_table_batch("order", batch_id, ADMIN)
    assert preview["matches"]
    assert stock.find.call_args.args[0]["stock_ref"] == {"$in": ["ref"]}
    approval.token = preview["token"]
    assert await catalog.approve_table_batch("order", batch_id, approval, ADMIN) == {"ok": True}
    with pytest.raises(HTTPException, match="alterado"):
        await catalog.approve_table_batch("order", batch_id, approval, ADMIN)
    query, update = orders.update_one.await_args.args
    assert query[f"table_item_batches.{batch_id}"] == batch
    assert update["$set"] == {f"table_item_batches.{batch_id}.stage": "stock_recorded"}
