"""Pure tests for beer keg yield and margins; no database required."""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from routers.beverages import KegYieldInput, estimate_keg_yield


def test_50_liter_keg_with_10_percent_loss():
    result = estimate_keg_yield(KegYieldInput(
        keg_liters=Decimal("50"), serving_ml=500, loss_pct=Decimal("10"),
        keg_cost=Decimal("500"), selling_price=Decimal("12"),
    ))
    assert result["estimated_servings"] == 90
    assert result["estimated_revenue"] == 1080.0
    assert result["estimated_gross_profit"] == 580.0


def test_30_liter_keg_without_loss():
    result = estimate_keg_yield(KegYieldInput(
        keg_liters=Decimal("30"), serving_ml=300,
        keg_cost=Decimal("200"), selling_price=Decimal("8"),
    ))
    assert result["estimated_servings"] == 100


def test_zero_revenue_margin_is_safe():
    result = estimate_keg_yield(KegYieldInput(
        keg_liters=Decimal("30"), serving_ml=300,
        keg_cost=Decimal("200"), selling_price=Decimal("0"),
    ))
    assert result["estimated_gross_margin_pct"] == 0


@pytest.mark.parametrize("field,value", [
    ("keg_liters", "0"), ("keg_liters", "-1"),
    ("serving_ml", 0), ("loss_pct", "100"),
    ("keg_cost", "-1"), ("selling_price", "-1"),
    ("keg_liters", "NaN"), ("keg_cost", "Infinity"),
])
def test_reject_invalid_inputs(field, value):
    data = dict(keg_liters="50", serving_ml=500, loss_pct="0",
                keg_cost="500", selling_price="12")
    data[field] = value
    with pytest.raises(ValidationError):
        KegYieldInput(**data)
