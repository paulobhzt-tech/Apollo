from routers.catalog import stock_alerts


def test_stock_alerts_prioritize_out_of_stock_and_calculate_cost():
    rows = [
        {"id": "ok", "name": "Bebida", "unit": "un", "stock": 15, "min_stock": 10, "cost_per_unit": 5},
        {"id": "low", "name": "Carne", "unit": "kg", "stock": 2, "min_stock": 5, "cost_per_unit": 30},
        {"id": "empty", "name": "Carvao", "unit": "kg", "stock": 0, "min_stock": 4, "cost_per_unit": 10},
    ]
    alerts = stock_alerts(rows)
    assert [row["ingredient_id"] for row in alerts] == ["empty", "low"]
    assert alerts[0]["severity"] == "sem_estoque"
    assert alerts[0]["estimated_minimum_cost"] == 40
    assert alerts[1]["missing_to_min"] == 3
    assert alerts[1]["estimated_minimum_cost"] == 90


def test_zero_minimum_only_alerts_when_out_of_stock():
    alerts = stock_alerts([
        {"id": "a", "name": "A", "stock": 2, "min_stock": 0},
        {"id": "b", "name": "B", "stock": 0, "min_stock": 0},
    ])
    assert len(alerts) == 1
    assert alerts[0]["ingredient_id"] == "b"
