from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from models.schemas import AddItemsIn, OrderItem
from routers import tables


@pytest.mark.parametrize("complete", [True, False])
async def test_repeat_table_submission_does_not_append_or_move_stock(monkeypatch, complete):
    order = {"id": "o1", "status": "aberto", "items": []}

    async def update_order(condition, changes, **options):
        for field, value in changes.get("$set", {}).items():
            parts = field.split(".")
            target = order
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
        order["items"].extend(changes.get("$push", {}).get("items", {}).get("$each", []))
        return SimpleNamespace(modified_count=1)

    orders = SimpleNamespace(find_one=AsyncMock(return_value=order), update_one=AsyncMock(side_effect=update_order))
    stock = AsyncMock(side_effect=None if complete else RuntimeError("simulated stock failure"))
    ticket = AsyncMock()
    monkeypatch.setattr(tables, "db", SimpleNamespace(orders=orders))
    monkeypatch.setattr(tables, "get_table", AsyncMock(return_value={"id": "m1", "number": 1, "order_id": "o1"}))
    monkeypatch.setattr(tables, "build_items", AsyncMock(return_value=[OrderItem(product_id="p", name="Produto", qty=1, unit_price=5)]))
    monkeypatch.setattr(tables, "create_ticket", ticket)
    monkeypatch.setattr(tables, "move_stock", stock)
    monkeypatch.setattr(tables, "refresh_totals", AsyncMock(return_value=order))
    order["number"] = 1
    actor = {"id": "g1", "name": "Garçom"}
    body = AddItemsIn(order_id="o1", client_ref="send-1", items=[{"product_id": "p", "qty": 1}])

    if complete:
        await tables.apply_add_items("m1", body, actor)
        assert await tables.apply_add_items("m1", body, actor) is order
    else:
        with pytest.raises(RuntimeError, match="simulated stock failure"):
            await tables.apply_add_items("m1", body, actor)
        with pytest.raises(HTTPException, match="pendente de conferência"):
            await tables.apply_add_items("m1", body, actor)

    with pytest.raises(HTTPException, match="outros itens"):
        altered = body.model_copy(update={"items": [body.items[0].model_copy(update={"qty": 2})]})
        await tables.apply_add_items("m1", altered, actor)
    assert len(order["items"]) == 1
    stock.assert_awaited_once()
    ticket.assert_awaited_once()
