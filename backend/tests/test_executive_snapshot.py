"""Executive snapshot totals and alerts."""
from routers.reports import executive_snapshot


def test_executive_snapshot_aggregates_paid_orders_and_alerts():
    orders = [{"status": "pago", "total": 100, "cmv": 30}, {"status": "aberto", "total": 900, "cmv": 100}]
    expenses = [{"amount": 120}]
    ingredients = [{"id": "i", "name": "Carne", "stock": 1, "min_stock": 2}]
    staff = [{"active": True}, {"active": False}]
    result = executive_snapshot(orders, expenses, ingredients, staff)
    assert result["revenue"] == 100
    assert result["indicative_balance"] == -50
    assert result["paid_orders"] == 1
    assert result["critical_stock_count"] == 1
    assert result["active_employees"] == 1
    assert len(result["alerts"]) == 2


def test_executive_snapshot_empty_data():
    result = executive_snapshot([], [], [], [])
    assert result["average_ticket"] == 0
    assert result["indicative_balance"] == 0
    assert result["alerts"][0]["title"] == "Sem vendas pagas"
