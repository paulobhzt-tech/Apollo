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
        await catalog.apply_inventory_count(body, {"name": "Operador"})
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
        await catalog.apply_stock_move(body, {"name": "Operador"})
    assert error.value.status_code == 409
    assert ingredients.update_one.await_args.args[0]["$or"] == [
        {"stock": {"$gte": 5.0}}, {"block_negative_stock": False},
    ]
    fake_db.stock_moves.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_purchase_includes_freight_and_taxes_in_weighted_average(monkeypatch):
    from models.schemas import PurchaseIn

    ingredients = SimpleNamespace(
        find_one=AsyncMock(return_value={"id": "i-1", "name": "Carne", "unit": "kg"}),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
    )
    purchases = SimpleNamespace(insert_one=AsyncMock())
    moves = SimpleNamespace(insert_one=AsyncMock())
    monkeypatch.setattr(catalog, "db", SimpleNamespace(
        suppliers=SimpleNamespace(find_one=AsyncMock(return_value={"name": "Fornecedor"})),
        ingredients=ingredients, purchases=purchases, stock_moves=moves,
    ))
    body = PurchaseIn(supplier_id="s-1", ingredient_id="i-1", qty=10, unit_cost=12,
                      freight_cost=8.5, tax_cost=3.5, bill_due_date="2026-12-10")
    result = await catalog.apply_purchase(body, {"name": "Operador"})
    assert result["total_cost"] == 132.0
    assert result["bill_due_date"] == "2026-12-10"
    assert result["freight_cost"] == 8.5
    assert result["tax_cost"] == 3.5
    update = ingredients.update_one.await_args.args[1][0]["$set"]
    assert update["cost_per_unit"]["$round"][0]["$divide"][0]["$add"][1] == 132.0
    assert update["stock"]["$add"][1] == 10
    assert purchases.insert_one.await_count == 1
    assert moves.insert_one.await_count == 1


@pytest.mark.asyncio
async def test_purchase_rejects_invalid_bill_date_before_stock_change(monkeypatch):
    from models.schemas import PurchaseIn

    ingredients = SimpleNamespace(
        find_one=AsyncMock(return_value={"id": "i-1", "name": "Carne", "unit": "kg"}),
        update_one=AsyncMock(),
    )
    monkeypatch.setattr(catalog, "db", SimpleNamespace(
        suppliers=SimpleNamespace(find_one=AsyncMock(return_value={"name": "Fornecedor"})),
        ingredients=ingredients,
    ))
    body = PurchaseIn(supplier_id="s-1", ingredient_id="i-1", qty=10, unit_cost=12,
                      bill_due_date="2026-12-99")
    with pytest.raises(HTTPException) as error:
        await catalog.apply_purchase(body, {"name": "Operador"})
    assert error.value.status_code == 400
    ingredients.update_one.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["inventory", "lot", "move"])
async def test_stock_counts_and_moves_reject_fractional_pieces(monkeypatch, operation):
    from models.schemas import InventoryCountIn, LotCountIn, StockMoveIn

    ingredients = SimpleNamespace(
        find_one=AsyncMock(return_value={"id": "i-1", "name": "Embalagem", "unit": "un"}),
        update_one=AsyncMock(),
    )
    purchases = SimpleNamespace(
        find_one=AsyncMock(return_value={"id": "p-1", "ingredient_id": "i-1", "remaining_qty": 10}),
        update_one=AsyncMock(),
    )
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=ingredients, purchases=purchases))
    actor = {"name": "Operador"}
    with pytest.raises(HTTPException) as error:
        if operation == "inventory":
            await catalog.apply_inventory_count(InventoryCountIn(ingredient_id="i-1", counted_qty=2.5), actor)
        elif operation == "lot":
            await catalog.apply_lot_count(LotCountIn(purchase_id="p-1", counted_qty=2.5), actor)
        else:
            await catalog.apply_stock_move(StockMoveIn(ingredient_id="i-1", type="entrada", qty=2.5), actor)

    assert error.value.status_code == 400
    ingredients.update_one.assert_not_awaited()
    purchases.update_one.assert_not_awaited()



@pytest.mark.asyncio
@pytest.mark.parametrize("qty,note", [(-1, "Contagem"), (2, ""), (2, "   ")])
async def test_stock_adjustment_requires_nonnegative_count_and_reason(monkeypatch, qty, note):
    from models.schemas import StockMoveIn

    ingredients = SimpleNamespace(find_one=AsyncMock(), update_one=AsyncMock())
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=ingredients))
    body = StockMoveIn(ingredient_id="i-1", type="ajuste", qty=qty, note=note)

    with pytest.raises(HTTPException) as error:
        await catalog.apply_stock_move(body, {"name": "Operador"})

    assert error.value.status_code == 400
    ingredients.update_one.assert_not_awaited()
