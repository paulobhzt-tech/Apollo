"""Sales and stock baseline forecasts."""
from datetime import datetime, timezone
from routers.reports import predict_sales_and_stock


def test_sales_forecast_and_recipe_replenishment():
    orders = [{"status": "pago", "paid_at": datetime(2026, 11, 5, 20, tzinfo=timezone.utc),
               "total": 280, "items": [{"product_id": "p", "qty": 4, "unit_price": 70}]}]
    products = [{"id": "p", "recipe": [{"ingredient_id": "i", "qty": 0.5}]}]
    ingredients = [{"id": "i", "name": "Carne", "unit": "kg", "stock": 0.2, "min_stock": 1}]
    result = predict_sales_and_stock(orders, products, ingredients, 28)
    assert result["observed_revenue"] == 280
    assert result["projected_next_7_days"] == 70
    assert result["restock_suggestions"][0]["suggested_purchase"] == 1.3


def test_forecast_excludes_open_and_cancelled():
    orders = [{"status": "aberto", "paid_at": datetime(2026, 11, 5, tzinfo=timezone.utc), "total": 100, "items": []},
              {"status": "pago", "paid_at": datetime(2026, 11, 5, tzinfo=timezone.utc), "total": 0,
               "items": [{"product_id": "p", "qty": 2, "cancelled": True}]}]
    result = predict_sales_and_stock(orders, [{"id": "p", "recipe": [{"ingredient_id": "i", "qty": 2}]}], [], 14)
    assert result["observed_revenue"] == 0
    assert result["restock_suggestions"] == []
