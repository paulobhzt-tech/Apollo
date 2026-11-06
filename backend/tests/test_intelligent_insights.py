"""Explainable insights based only on recorded paid sales."""
from routers.reports import build_business_insights


def test_insights_ignore_unpaid_and_cancelled_items():
    orders = [{"status": "pago", "total": 100, "items": [
        {"product_id": "a", "name": "Espetinho", "qty": 2, "unit_price": 30, "unit_cost": 10},
        {"product_id": "b", "name": "Cancelado", "qty": 1, "unit_price": 40, "cancelled": True}]},
        {"status": "aberto", "total": 200, "items": [{"product_id": "b", "name": "Outro", "qty": 2, "unit_price": 100}]}]
    products = [{"id": "a", "name": "Espetinho", "active": True}, {"id": "b", "name": "Outro", "active": True}]
    result = build_business_insights(orders, [{"amount": 120}], products)
    assert result["revenue"] == 100
    assert result["paid_orders"] == 1
    assert result["top_contribution"][0]["contribution"] == 40
    assert result["unsold_count"] == 1
    assert any(i["level"] == "warning" for i in result["insights"])


def test_insights_empty_data_and_zero_ticket():
    result = build_business_insights([], [], [])
    assert result["average_ticket"] == 0
    assert result["top_contribution"] == []
    assert result["method"] == "regras_explicaveis"
    assert any(i["title"] == "Sem vendas pagas" for i in result["insights"])


def test_insights_zero_revenue_does_not_divide_by_zero():
    orders = [{"status": "pago", "total": 0, "items": [{"product_id": "x", "name": "Cortesia", "qty": 1, "unit_price": 0}]}]
    result = build_business_insights(orders, [], [])
    assert result["top_contribution"][0]["margin_pct"] == 0
