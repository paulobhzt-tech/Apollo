"""Catalog and purchase replay using a disposable standalone MongoDB."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from lib.db import db
from models.schemas import CategoryIn, IngredientIn, ProductIn, PurchaseIn, SupplierIn
from routers import catalog

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_catalog_purchase_recovers_replay_without_duplicating_stock(monkeypatch):
    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer um MongoDB descartável")
    prefix = f"catalog-test-{uuid4().hex}"
    user = {"id": prefix, "name": "Operador fictício"}
    station = prefix
    await db.environments.insert_one({"key": station})
    supplier = await catalog.create_supplier(SupplierIn(name=f"{prefix} fornecedor"), user)
    ingredient = await catalog.create_ingredient(IngredientIn(name=f"{prefix} insumo", unit="un"), user)
    category = await catalog.create_category(CategoryIn(name=f"{prefix} categoria", station=station), user)
    product = await catalog.create_product(ProductIn(name=f"{prefix} produto", category_id=category["id"],
        price=10, sale_unit="un", stock_ingredient_id=ingredient["id"]), user)
    body = PurchaseIn(supplier_id=supplier["id"], ingredient_id=ingredient["id"],
        product_id=product["id"], qty=2, unit_cost=5, client_ref=f"{prefix}-first")
    try:
        bad = body.model_copy(update={"qty": 1.5})
        with pytest.raises(HTTPException, match="quantidades inteiras"):
            await catalog.register_purchase(bad, user)
        result = await catalog.register_purchase(body, user)
        assert result["total_cost"] == 10
        assert (await catalog.register_purchase(body, user))["id"] == result["id"]
        with pytest.raises(HTTPException, match="outros dados"):
            await catalog.register_purchase(body.model_copy(update={"qty": 3}), user)
        assert (await db.ingredients.find_one({"id": ingredient["id"]}))["stock"] == 2

        interrupted = body.model_copy(update={"client_ref": f"{prefix}-second"})
        broken_db = SimpleNamespace(
            command=db.command, suppliers=db.suppliers, ingredients=db.ingredients, products=db.products,
            purchases=db.purchases, purchase_attempts=db.purchase_attempts,
            stock_moves=SimpleNamespace(insert_one=AsyncMock(side_effect=RuntimeError("interrupção fictícia"))),
        )
        with monkeypatch.context() as patch:
            patch.setattr(catalog, "db", broken_db)
            with pytest.raises(RuntimeError, match="interrupção fictícia"):
                await catalog.register_purchase(interrupted, user)
        with pytest.raises(HTTPException, match="sem confirmação"):
            await catalog.register_purchase(interrupted, user)
        assert (await db.ingredients.find_one({"id": ingredient["id"]}))["stock"] == 4
        assert await db.stock_moves.count_documents({"ingredient_id": ingredient["id"]}) == 1
    finally:
        purchases = await db.purchases.find({"ingredient_id": ingredient["id"]}, {"_id": 1}).to_list(20)
        await db.purchase_attempts.delete_many({"_id": {"$in": [row["_id"] for row in purchases]}})
        await db.purchases.delete_many({"ingredient_id": ingredient["id"]})
        await db.stock_moves.delete_many({"ingredient_id": ingredient["id"]})
        await db.products.delete_one({"id": product["id"]})
        await db.ingredients.delete_one({"id": ingredient["id"]})
        await db.categories.delete_one({"id": category["id"]})
        await db.suppliers.delete_one({"id": supplier["id"]})
        await db.environments.delete_one({"key": station})
