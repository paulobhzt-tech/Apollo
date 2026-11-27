"""Operational cashflow calculations are deterministic and exclude fiado from cash sales."""
from datetime import datetime, timezone
from routers.reports import summarize_cashflow


def test_cashflow_groups_entries_and_outflows_without_fiado():
    orders = [{"paid_at": datetime(2026, 11, 5, 15, tzinfo=timezone.utc),
               "payments": [{"method": "pix", "amount": 80}, {"method": "fiado", "amount": 20}]}]
    bills = [{"kind": "receber", "paid_date": "2026-11-05", "paid_amount": 30},
             {"kind": "pagar", "paid_date": "2026-11-05", "paid_amount": 15}]
    expenses = [{"date": "2026-11-05", "amount": 10}]
    result = summarize_cashflow(orders, bills, expenses, "2026-11-01", "2026-11-30")
    assert result["totals"] == {"sales": 80, "receivables": 30, "payables": 15, "expenses": 10, "balance": 85}
    assert len(result["days"]) == 1


def test_cashflow_ignores_movements_outside_period_and_empty_dates():
    orders = [{"paid_at": datetime(2026, 10, 31, 12, tzinfo=timezone.utc),
               "payments": [{"method": "dinheiro", "amount": 40}]}]
    bills = [{"kind": "pagar", "paid_date": None, "paid_amount": 9}]
    expenses = [{"date": "2026-12-01", "amount": 20}]
    result = summarize_cashflow(orders, bills, expenses, "2026-11-01", "2026-11-30")
    assert result["days"] == []
    assert result["totals"]["balance"] == 0


def test_cashflow_does_not_mutate_input():
    expenses = [{"date": "2026-11-05", "amount": 1.235}]
    result = summarize_cashflow([], [], expenses, "2026-11-01", "2026-11-30")
    assert result["totals"]["expenses"] == 1.24
    assert expenses[0]["amount"] == 1.235


def test_cashflow_posts_receipts_and_remaining_settlement_on_separate_days():
    from datetime import datetime, timezone

    def at(day):
        return datetime(2026, 11, day, 12, tzinfo=timezone.utc)

    orders = [{"paid_at": at(4), "payments": [
        {"method": "dinheiro", "amount": 18},
        {"method": "dinheiro", "amount": 17},
    ], "closing_payments": [{"method": "dinheiro", "amount": 17}], "change": 2}]
    receipts = [
        {"at": at(2), "totals_by_method": {"dinheiro": 18}},
        {"at": at(3), "totals_by_method": {"pix": 5}},
        {"at": at(5), "totals_by_method": {"pix": -5}},
    ]
    cancelled = [{"cancelled_at": at(5), "advance_paid": 8}]
    result = summarize_cashflow(orders, [], [], "2026-11-01", "2026-11-30",
                                table_receipts=receipts, cancelled_tables=cancelled)
    assert [row["sales"] for row in result["days"]] == [18, 5, 15, -13]
    assert result["totals"]["sales"] == 25
