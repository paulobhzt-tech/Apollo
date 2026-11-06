"""Paid-order-only staff productivity and commission estimates."""
from routers.reports import employee_sales_summary


def test_employee_performance_ignores_open_and_other_channels():
    employees = [{"id": "a", "name": "Ana", "role": "garcom", "commission_pct": 5},
                 {"id": "b", "name": "Beto", "role": "garcom", "commission_pct": 10}]
    orders = [{"status": "pago", "channel": "mesa", "waiter_id": "a", "total": 100},
              {"status": "pago", "channel": "mesa", "waiter_id": "a", "total": 50},
              {"status": "aberto", "channel": "mesa", "waiter_id": "a", "total": 200},
              {"status": "pago", "channel": "delivery", "waiter_id": "a", "total": 300},
              {"status": "pago", "channel": "mesa", "waiter_id": "unknown", "total": 20}]
    result = employee_sales_summary(orders, employees)
    assert result[0]["name"] == "Ana"
    assert result[0]["sales"] == 150
    assert result[0]["orders"] == 2
    assert result[0]["average_ticket"] == 75
    assert result[0]["estimated_commission"] == 7.5
    assert result[1]["sales"] == 0


def test_employee_performance_does_not_mutate_employee_data():
    employee = {"id": "a", "name": "Ana", "role": "garcom", "commission_pct": 2.5}
    result = employee_sales_summary([{"status": "pago", "channel": "mesa", "waiter_id": "a", "total": 19.99}], [employee])
    assert result[0]["estimated_commission"] == 0.5
    assert "sales" not in employee
