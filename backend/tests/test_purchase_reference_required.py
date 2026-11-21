"""Purchase requests without idempotency identity must fail before database access."""
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from models.schemas import PurchaseIn
from routers import catalog

@pytest.mark.asyncio
async def test_purchase_without_reference_cannot_change_stock(monkeypatch):
    monkeypatch.setattr(catalog, "db", SimpleNamespace())
    body = PurchaseIn(supplier_id="fictitious", ingredient_id="fictitious", qty=1, unit_cost=1)
    with pytest.raises(HTTPException) as error:
        await catalog.register_purchase(body, {"id": "fictitious"})
    assert error.value.status_code == 422
    assert "referência persistente" in error.value.detail
