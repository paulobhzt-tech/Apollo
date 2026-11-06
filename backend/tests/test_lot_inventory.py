"""Regression checks for FEFO expiry ordering and validated inventory inputs."""
import pytest
from pydantic import ValidationError

from lib.orders import fefo_usable_lots
from models.schemas import InventoryCountIn, LotCountIn, PurchaseIn


def test_fefo_uses_earliest_valid_expiry_and_excludes_expired():
    lots = [
        {"id": "late", "expiry_date": "2026-12-01", "created_at": "2026-11-01"},
        {"id": "expired", "expiry_date": "2026-11-01", "created_at": "2026-10-01"},
        {"id": "soon", "expiry_date": "2026-11-08", "created_at": "2026-11-02"},
        {"id": "undated", "expiry_date": None, "created_at": "2026-10-01"},
    ]
    assert [p["id"] for p in fefo_usable_lots(lots, "2026-11-06")] == ["soon", "late", "undated"]


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf")])
def test_lot_inventory_rejects_invalid_count(value):
    with pytest.raises(ValidationError):
        LotCountIn(purchase_id="lot-1", counted_qty=value)


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf")])
def test_total_inventory_rejects_invalid_count(value):
    with pytest.raises(ValidationError):
        InventoryCountIn(ingredient_id="ing-1", counted_qty=value)


def test_purchase_rejects_invalid_quantities():
    with pytest.raises(ValidationError):
        PurchaseIn(supplier_id="s", ingredient_id="i", qty=0, unit_cost=1)
