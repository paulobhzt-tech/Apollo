"""Sales trends compare only paid orders in equivalent periods."""
from routers.reports import compare_sales_trends


def test_trends_detect_revenue_decline_and_product_changes():
    current = [{"status": "pago", "total": 80, "items": [{"product_id": "p", "name": "Espeto", "qty": 2}]} for _ in range(3)]
    previous = [{"status": "pago", "total": 120, "items": [{"product_id": "p", "name": "Espeto", "qty": 4}]} for _ in range(3)]
    result = compare_sales_trends(current, previous)
    assert result["revenue_change_pct"] == -33.3
    assert result["current_average_ticket"] == 80
    assert result["products"][0]["delta_qty"] == -6
    assert any(a["title"] == "Queda de faturamento" for a in result["alerts"])


def test_trends_without_prior_sales_have_no_percentage():
    result = compare_sales_trends([{"status": "pago", "total": 50, "items": []}], [])
    assert result["revenue_change_pct"] is None
    assert any(a["title"] == "Amostra pequena" for a in result["alerts"])


def test_trends_ignore_unpaid_and_cancelled_items():
    current = [{"status": "aberto", "total": 900, "items": [{"product_id": "p", "name": "Espeto", "qty": 10}]},
               {"status": "pago", "total": 10, "items": [{"product_id": "p", "name": "Espeto", "qty": 5, "cancelled": True}]}]
    result = compare_sales_trends(current, [])
    assert result["current_revenue"] == 10
    assert result["products"] == []
