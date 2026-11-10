"""Ingredient metadata edits must not overwrite stock changed after opening a form."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from models.schemas import IngredientUpdateIn
from routers import catalog


@pytest.fixture
def ingredients(monkeypatch):
    collection = SimpleNamespace(find_one_and_update=AsyncMock(), find_one=AsyncMock())
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=collection))
    return collection


def body(**overrides):
    return IngredientUpdateIn(name="Carne", unit="kg", stock=12, cost_per_unit=35, **overrides)


@pytest.mark.asyncio
async def test_expected_stock_is_part_of_atomic_filter_and_not_stored(ingredients):
    ingredients.find_one_and_update.return_value = {"id": "i-1", "stock": 12}
    result = await catalog.update_ingredient("i-1", body(expected_stock=10), {})
    assert result["stock"] == 12
    query, update = ingredients.find_one_and_update.await_args.args
    assert query == {"id": "i-1", "stock": 10}
    assert "expected_stock" not in update["$set"]
    assert update["$set"]["stock"] == 12


@pytest.mark.asyncio
async def test_changed_stock_returns_conflict_without_second_write(ingredients):
    ingredients.find_one_and_update.return_value = None
    ingredients.find_one.return_value = {"id": "i-1"}
    with pytest.raises(HTTPException) as exc:
        await catalog.update_ingredient("i-1", body(expected_stock=10), {})
    assert exc.value.status_code == 409
    ingredients.find_one_and_update.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_ingredient_still_returns_404(ingredients):
    ingredients.find_one_and_update.return_value = None
    ingredients.find_one.return_value = None
    with pytest.raises(HTTPException) as exc:
        await catalog.update_ingredient("i-1", body(expected_stock=10), {})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_legacy_editor_remains_compatible_and_does_not_store_metadata(ingredients):
    ingredients.find_one_and_update.return_value = {"id": "i-1"}
    await catalog.update_ingredient("i-1", body(), {})
    query, update = ingredients.find_one_and_update.await_args.args
    assert query == {"id": "i-1"}
    assert "expected_stock" not in update["$set"]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_expected_stock_must_be_finite(value):
    with pytest.raises(ValidationError):
        body(expected_stock=value)
