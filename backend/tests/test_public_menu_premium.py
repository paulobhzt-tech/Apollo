"""Public QR menu contract regression tests."""
import pytest
from pydantic import ValidationError
from models.schemas import PublicOrderIn, OrderItemIn


def test_public_table_order_accepts_valid_customizations():
    order = PublicOrderIn(items=[OrderItemIn(
        product_id="espeto-1", qty=2, notes="Sem cebola",
        customer_name="Cliente 1",
    )])
    assert order.items[0].qty == 2
    assert order.items[0].notes == "Sem cebola"


@pytest.mark.parametrize("count", [0, 51])
def test_public_table_order_rejects_empty_or_oversized_cart(count):
    with pytest.raises(ValidationError):
        PublicOrderIn(items=[{"product_id": "p", "qty": 1} for _ in range(count)])


@pytest.mark.parametrize("quantity", [0, 100])
def test_public_table_order_rejects_invalid_quantity(quantity):
    with pytest.raises(ValidationError):
        PublicOrderIn(items=[{"product_id": "p", "qty": quantity}])
