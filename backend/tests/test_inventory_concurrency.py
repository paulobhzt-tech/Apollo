"""Stock adjustments must not overwrite a concurrent inventory change."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import catalog


@pytest.mark.asyncio
async def test_inventory_count_detects_concurrent_stock_change(monkeypatch):
    ing = {"id": "i-1", "name": "Carne", "stock": 10.0}
    ingredients = SimpleNamespace(
        find_one=AsyncMock(return_value=ing),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
    )
    fake_db = SimpleNamespace(ingredients=ingredients, inventory_counts=SimpleNamespace(insert_one=AsyncMock()))
    monkeypatch.setattr(catalog, "db", fake_db)
    body = SimpleNamespace(ingredient_id="i-1", counted_qty=8.0, note="Conferencia",
                           model_dump=lambda **kwargs: {"ingredient_id": "i-1", "counted_qty": 8.0, "note": "Conferencia"})
    with pytest.raises(HTTPException) as error:
        await catalog.register_inventory_count(body, {"name": "Operador"})
    assert error.value.status_code == 409
    assert ingredients.update_one.await_args.args[0] == {"id": "i-1", "stock": 10.0}
    fake_db.inventory_counts.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_stock_outflow_requires_available_quantity_unless_explicitly_allowed(monkeypatch):
    ing = {"id": "i-1", "name": "Carne", "stock": 3.0}
    ingredients = SimpleNamespace(
        find_one=AsyncMock(return_value=ing),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
    )
    fake_db = SimpleNamespace(ingredients=ingredients, stock_moves=SimpleNamespace(insert_one=AsyncMock()))
    monkeypatch.setattr(catalog, "db", fake_db)
    body = SimpleNamespace(ingredient_id="i-1", type="saida", qty=5.0, note="", reason="")
    with pytest.raises(HTTPException) as error:
        await catalog.create_move(body, {"name": "Operador"})
    assert error.value.status_code == 409
    assert ingredients.update_one.await_args.args[0]["$or"] == [
        {"stock": {"$gte": 5.0}}, {"block_negative_stock": False},
    ]
    fake_db.stock_moves.insert_one.assert_not_awaited()
