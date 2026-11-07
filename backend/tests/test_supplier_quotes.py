"""Unit tests for supplier quotation comparison."""
import pytest

from routers.supplier_quotes import SupplierQuoteIn, compare_quotes


def test_cheapest_eligible_quote_first():
    quotes = [
        {"id": "a", "supplier_id": "s1", "unit_price": 12, "minimum_qty": 1, "delivery_days": 1},
        {"id": "b", "supplier_id": "s2", "unit_price": 10, "minimum_qty": 5, "delivery_days": 3},
        {"id": "c", "supplier_id": "s3", "unit_price": 8, "minimum_qty": 100, "delivery_days": 1},
    ]
    result = compare_quotes(quotes, 10)
    assert [q["id"] for q in result] == ["b", "a"]
    assert result[0]["estimated_total"] == 100
    assert len(quotes[0]) == 5  # input remains unchanged


def test_zero_quantity_rejected():
    with pytest.raises(ValueError):
        compare_quotes([], 0)


def test_quote_validation():
    with pytest.raises(ValueError):
        SupplierQuoteIn(supplier_id="s", ingredient_id="i", unit_price=-1)
