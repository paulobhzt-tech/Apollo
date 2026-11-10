"""Read-only replenishment planning: thresholds, negative balances and permissions."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import FastAPI

from lib.auth import current_user
from routers import catalog


def ingredient(stock=2, minimum=5, cost=10, unit="kg", id="i-1", name="Carne"):
    return {"id": id, "name": name, "stock": stock, "min_stock": minimum, "cost_per_unit": cost, "unit": unit}


def test_below_minimum_targets_double_and_estimates_cost():
    plan = catalog.replenishment_plan([ingredient()])
    assert plan["items"][0]["suggested"] == 8
    assert plan["estimated_known_cost"] == 80
    assert plan["review_required"] == 0


def test_negative_stock_is_included_and_flagged_for_review():
    plan = catalog.replenishment_plan([ingredient(stock=-3)], 1)
    assert plan["items"][0]["suggested"] == 8
    assert plan["items"][0]["reason"] == "negative_stock"
    assert plan["review_required"] == 1


def test_zero_minimum_never_invents_target_for_missing_or_negative_stock():
    plan = catalog.replenishment_plan([ingredient(stock=-2, minimum=0), ingredient(stock=3, minimum=0, id="i-2")])
    assert plan["total"] == 1
    assert plan["items"][0]["suggested"] is None
    assert plan["items"][0]["reason"] == "configure_minimum"
    assert plan["items_without_cost"] == 1


def test_stock_at_or_above_minimum_needs_no_replenishment():
    assert catalog.replenishment_plan([ingredient(stock=5), ingredient(stock=8)])["items"] == []


def test_whole_unit_purchases_round_up():
    item = catalog.replenishment_plan([ingredient(stock=1.5, minimum=2, unit="un")])["items"][0]
    assert item["suggested"] == 3


def test_unknown_or_invalid_cost_is_not_reported_as_free():
    for cost in [0, -1, None, "bad", float("inf")]:
        plan = catalog.replenishment_plan([ingredient(cost=cost)])
        assert plan["items"][0]["estimated_cost"] is None
        assert plan["items_without_cost"] == 1


def test_bad_legacy_quantities_are_skipped_and_input_is_unchanged():
    rows = [ingredient(stock=float("nan")), ingredient(minimum="bad"), ingredient(stock=1, minimum=1e308)]
    assert catalog.replenishment_plan(rows, 3)["items"] == []
    row = ingredient(stock=-1)
    original = dict(row)
    catalog.replenishment_plan([row])
    assert row == original


def test_invalid_target_rejected():
    with pytest.raises(ValueError):
        catalog.replenishment_plan([], 4)


@pytest.mark.asyncio
@pytest.mark.parametrize("role,status", [("admin", 200), ("caixa", 200), ("cozinha", 200), ("garcom", 403)])
async def test_read_only_route_permissions_and_no_writes(monkeypatch, role, status):
    find = Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[ingredient()])))
    # No write methods exist on the fake: accidental stock/purchase mutations fail.
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=SimpleNamespace(find=find)))
    app = FastAPI()
    app.include_router(catalog.router)
    app.dependency_overrides[current_user] = lambda: {"id": "user-1", "role": role}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/inventory/replenishment?target_multiplier=3")
    assert response.status_code == status
    if status == 200:
        assert response.json()["items"][0]["suggested"] == 13
        find.assert_called_once()
    else:
        find.assert_not_called()


@pytest.mark.asyncio
async def test_route_rejects_unbounded_target_without_database_access(monkeypatch):
    find = Mock()
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=SimpleNamespace(find=find)))
    app = FastAPI()
    app.include_router(catalog.router)
    app.dependency_overrides[current_user] = lambda: {"id": "user-1", "role": "admin"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/inventory/replenishment?target_multiplier=100")
    assert response.status_code == 422
    find.assert_not_called()
