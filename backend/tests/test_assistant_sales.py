from routers.assistant import sales_answer, format_sales_answer, yesterday_sales_answer, format_yesterday_answer, monthly_expense_answer, format_monthly_expense_answer

def test_daily_sales_answer_uses_paid_orders_only():
    today = [{"total": 100}, {"total": 50}]
    metrics = sales_answer("2026-11-07", today, [{"total": 100}], 300)
    assert metrics["revenue"] == 150
    assert metrics["paid_orders"] == 2
    assert metrics["average_ticket"] == 75
    assert metrics["revenue_change_pct"] == 50
    assert metrics["goal_pct"] == 50
    assert "R$ 150,00" in format_sales_answer(metrics)
    assert "parcial" in format_sales_answer(metrics)

def test_zero_sales_and_zero_goal_are_explicit():
    metrics = sales_answer("2026-11-07", [], [], 0)
    assert metrics["revenue"] == 0
    assert metrics["average_ticket"] == 0
    assert metrics["revenue_change_pct"] is None
    assert metrics["goal_pct"] is None
    assert "indisponível" in format_sales_answer(metrics)


def test_yesterday_sales_are_closed_period_and_no_profit_claim():
    metrics = yesterday_sales_answer("2026-11-06", [{"total": 90}, {"total": 30}])
    assert metrics == {"date": "2026-11-06", "revenue": 120.0,
                       "paid_orders": 2, "average_ticket": 60.0, "partial_day": False}
    answer = format_yesterday_answer(metrics)
    assert "R$ 120,00" in answer
    assert "não representa lucro" in answer
    assert "parcial" not in answer


def test_monthly_expense_answer_uses_only_recorded_entries():
    metrics = monthly_expense_answer("2026-10", [{"amount": 20}, {"amount": 30.5}])
    assert metrics["recorded_expenses"] == 50.5
    assert metrics["entries"] == 2
    assert metrics["partial_month"] is False
    answer = format_monthly_expense_answer(metrics)
    assert "R$ 50,50" in answer
    assert "não representam lucro" in answer
