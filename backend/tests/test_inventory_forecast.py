"""Consumption forecasts use gross sales, disclose sparse history and never create purchases."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import FastAPI

from lib.auth import current_user
from routers import catalog

AT = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


def ingredient(stock=2, minimum=5, unit="kg"):
    return {"id": "i-1", "name": "Carne", "stock": stock, "min_stock": minimum, "unit": unit}


def move(qty=-7, kind="venda", days=1, **overrides):
    return {"ingredient_id": "i-1", "qty": qty, "type": kind, "created_at": AT - timedelta(days=days), **overrides}


def forecast(moves=None, **overrides):
    params = {"window_days": 7, "lead_days": 2, "buffer_days": 1, "as_of": AT}
    params.update(overrides)
    return catalog.inventory_consumption_forecast([ingredient()], moves or [], **params)


def test_absolute_sales_and_separate_losses_drive_forecast():
    result = forecast([move(-7, days=1), move(7, days=2), move(-7, days=3), move(-20, kind="perda"), move(100, kind="entrada"), move(5, kind="estorno")])
    item = result["items"][0]
    assert item["sales_consumption"] == 21
    assert item["loss_qty"] == 20
    assert item["daily_average"] == 3
    assert item["target_stock"] == 9
    assert item["suggested"] == 7
    assert item["coverage_days"] == 0.7
    assert item["sales_days"] == 3


def test_sparse_history_discloses_insufficiency_instead_of_inventing_suggestion():
    for moves in [[], [move()], [move(), move(days=2)]]:
        item = forecast(moves)["items"][0]
        assert item["insufficient_history"] is True
        assert item["suggested"] is None
        assert item["target_stock"] is None


def test_multiple_sales_on_one_day_do_not_imply_three_days_history():
    assert forecast([move(), move(), move()])["items"][0]["sales_days"] == 1
    assert forecast([move(), move(), move()])["insufficient_history_count"] == 1


def test_negative_stock_is_flagged_and_minimum_remains_target_floor():
    item = catalog.inventory_consumption_forecast([ingredient(stock=-2, minimum=10)],
        [move(-1, days=n) for n in (1, 2, 3)], window_days=7, lead_days=1, buffer_days=0, as_of=AT)["items"][0]
    assert item["target_stock"] == 10
    assert item["suggested"] == 12
    assert item["coverage_days"] == 0
    assert item["review_negative_stock"] is True


def test_whole_units_round_up_and_zero_minimum_does_not_disable_consumption_forecast():
    item = catalog.inventory_consumption_forecast([ingredient(stock=0, minimum=0, unit="un")],
        [move(-1, days=n) for n in (1, 2, 3)], window_days=7, lead_days=2, buffer_days=0, as_of=AT)["items"][0]
    assert item["suggested"] == 1


def test_outside_window_future_invalid_and_nonfinite_movements_ignored():
    moves = [move(days=8), move(days=-1), move(created_at="invalid"), move(qty=float("nan")), move(qty="bad"), move(kind="perda")]
    item = forecast(moves)["items"][0]
    assert item["sales_consumption"] == 0
    assert item["loss_qty"] == 7
    assert item["coverage_days"] is None


def test_iso_dates_and_naive_dates_are_interpreted_in_utc():
    moves = [move(days=n) for n in (1, 2, 3)]
    moves[0]["created_at"] = moves[0]["created_at"].isoformat().replace("+00:00", "Z")
    moves[1]["created_at"] = moves[1]["created_at"].replace(tzinfo=None)
    assert forecast(moves)["items"][0]["sales_days"] == 3


def test_truncated_history_never_generates_suggestion():
    result = forecast([move(days=n) for n in (1, 2, 3)], history_truncated=True)
    assert result["history_truncated"] is True
    assert result["items"][0]["suggested"] is None


@pytest.mark.parametrize("params", [{"window_days": 6}, {"window_days": 91}, {"lead_days": 0}, {"lead_days": 61}, {"buffer_days": -1}, {"buffer_days": 31}])
def test_input_limits(params):
    with pytest.raises(ValueError):
        forecast(**params)


@pytest.mark.asyncio
@pytest.mark.parametrize("role,status", [("admin", 200), ("caixa", 200), ("cozinha", 200), ("garcom", 403)])
async def test_endpoint_permissions_and_read_only_database_access(monkeypatch, role, status):
    ingredients_find = Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[ingredient()])))
    moves_find = Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[move(days=n) for n in (1, 2, 3)])))
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=SimpleNamespace(find=ingredients_find), stock_moves=SimpleNamespace(find=moves_find)))
    monkeypatch.setattr(catalog, "now", lambda: AT)
    app = FastAPI()
    app.include_router(catalog.router)
    app.dependency_overrides[current_user] = lambda: {"id": "u-1", "role": role}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/inventory/forecast?window_days=7&lead_days=2&buffer_days=1")
    assert response.status_code == status
    if status == 200:
        assert response.json()["items"][0]["suggested"] == 7
        query = moves_find.call_args.args[0]
        assert query["type"] == {"$in": ["venda", "perda"]}
        assert query["created_at"] == {"$gte": AT - timedelta(days=7), "$lte": AT}
    else:
        ingredients_find.assert_not_called()
        moves_find.assert_not_called()


@pytest.mark.asyncio
async def test_invalid_route_parameters_do_not_query_database(monkeypatch):
    find = Mock()
    monkeypatch.setattr(catalog, "db", SimpleNamespace(ingredients=SimpleNamespace(find=find)))
    app = FastAPI()
    app.include_router(catalog.router)
    app.dependency_overrides[current_user] = lambda: {"id": "u-1", "role": "admin"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/inventory/forecast?window_days=1000")
    assert response.status_code == 422
    find.assert_not_called()
