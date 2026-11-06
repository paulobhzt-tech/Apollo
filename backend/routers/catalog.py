from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require
from lib.db import db
from lib.orders import ingredient_map, now, product_cost
from models.schemas import (BulkDeleteIn, Category, CategoryIn, Ingredient, IngredientIn, OkOut, Product, ProductIn, Supplier, SupplierIn,
                            StockMove, StockMoveIn, ProductionBatch, ProductionBatchIn, Purchase, PurchaseIn)

router = APIRouter()


def with_cost(p: dict, ings: dict) -> dict:
    cost = product_cost(p, ings)
    p["cost"] = cost
    p["margin_pct"] = round((p["price"] - cost) / p["price"] * 100, 1) if p["price"] else 0
    return p


async def products_with_cost(q: dict) -> list[dict]:
    ings = await ingredient_map()
    return [with_cost(p, ings) for p in await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(2000)]


async def _check_station(key: str) -> None:
    if key and not await db.environments.find_one({"key": key}):
        raise HTTPException(400, "Ambiente de produção inválido")


# ---------- categories ----------
@router.get("/categories", response_model=list[Category])
async def list_categories(_: dict = Depends(current_user)):
    return await db.categories.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(500)


@router.post("/categories", response_model=Category)
async def create_category(body: CategoryIn, _: dict = Depends(require())):
    await _check_station(body.station)
    c = Category(**body.model_dump()).model_dump()
    await db.categories.insert_one(dict(c))
    return c


@router.put("/categories/{id}", response_model=Category)
async def update_category(id: str, body: CategoryIn, _: dict = Depends(require())):
    await _check_station(body.station)
    res = await db.categories.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Categoria não encontrada")
    return res


@router.delete("/categories/{id}", response_model=OkOut)
async def delete_category(id: str, _: dict = Depends(require())):
    if await db.products.find_one({"category_id": id}):
        raise HTTPException(400, "Existem produtos nesta categoria")
    await db.categories.delete_one({"id": id})
    return OkOut()


# ---------- products ----------
@router.get("/products", response_model=list[Product])
async def list_products(_: dict = Depends(current_user)):
    return await products_with_cost({})


async def _validate_product(body: ProductIn) -> None:
    if not await db.categories.find_one({"id": body.category_id}):
        raise HTTPException(400, "Categoria inválida")
    await _check_station(body.station)
    names = {p["name"].strip().lower(): p["id"] for p in await db.products.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    for g in body.options:  # a choice named exactly like a product becomes a combo link
        for c in g.choices:
            c.product_id = names.get(c.name.strip().lower())
    ids = {r.ingredient_id for r in body.recipe}
    if ids and await db.ingredients.count_documents({"id": {"$in": list(ids)}}) != len(ids):
        raise HTTPException(400, "Insumo inválido na ficha técnica")


@router.post("/products", response_model=Product)
async def create_product(body: ProductIn, _: dict = Depends(require())):
    await _validate_product(body)
    p = Product(**body.model_dump()).model_dump()
    p.pop("cost"), p.pop("margin_pct")
    await db.products.insert_one(dict(p))
    return with_cost(p, await ingredient_map())


@router.put("/products/{id}", response_model=Product)
async def update_product(id: str, body: ProductIn, _: dict = Depends(require())):
    await _validate_product(body)
    res = await db.products.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Produto não encontrado")
    return with_cost(res, await ingredient_map())


@router.delete("/products/{id}", response_model=OkOut)
async def delete_product(id: str, _: dict = Depends(require())):
    res = await db.products.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Produto não encontrado")
    return OkOut()


@router.post("/products/bulk-delete", response_model=OkOut)
async def bulk_delete_products(body: BulkDeleteIn, _: dict = Depends(require())):
    res = await db.products.delete_many({"id": {"$in": body.ids}})
    return OkOut(message=f"{res.deleted_count} produto(s) apagado(s)")


# ---------- suppliers ----------
@router.get("/suppliers", response_model=list[Supplier])
async def list_suppliers(_: dict = Depends(require("caixa"))):
    return await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(5000)


@router.post("/suppliers", response_model=Supplier)
async def create_supplier(body: SupplierIn, _: dict = Depends(require())):
    s = Supplier(**body.model_dump()).model_dump()
    await db.suppliers.insert_one(dict(s))
    return s


@router.put("/suppliers/{id}", response_model=Supplier)
async def update_supplier(id: str, body: SupplierIn, _: dict = Depends(require())):
    res = await db.suppliers.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Fornecedor não encontrado")
    return res


@router.delete("/suppliers/{id}", response_model=OkOut)
async def delete_supplier(id: str, _: dict = Depends(require())):
    if not (await db.suppliers.delete_one({"id": id})).deleted_count:
        raise HTTPException(404, "Fornecedor não encontrado")
    return OkOut(message="Fornecedor descadastrado")


# ---------- purchases and expiry tracking ----------
@router.get("/purchases", response_model=list[Purchase])
async def list_purchases(_: dict = Depends(require("caixa"))):
    return await db.purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/purchases", response_model=Purchase)
async def register_purchase(body: PurchaseIn, user: dict = Depends(require("caixa"))):
    supplier = await db.suppliers.find_one({"id": body.supplier_id}, {"_id": 0})
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado")
    if not ing:
        raise HTTPException(404, "Insumo não encontrado")
    if body.expiry_date:
        try:
            expiry = date.fromisoformat(body.expiry_date)
        except ValueError:
            raise HTTPException(400, "Validade deve estar no formato AAAA-MM-DD")
        if expiry < date.today():
            raise HTTPException(400, "Não é possível cadastrar compra já vencida")
    qty = round(body.qty, 4)
    if qty <= 0:
        raise HTTPException(400, "Quantidade muito pequena")
    # Weighted average unit cost keeps existing inventory value when receiving a new purchase.
    old_stock = max(0, float(ing.get("stock", 0)))
    old_cost = max(0, float(ing.get("cost_per_unit", 0)))
    new_cost = round((old_stock * old_cost + qty * body.unit_cost) / (old_stock + qty), 4)
    purchase = Purchase(**body.model_dump(), qty=qty, supplier_name=supplier["name"],
                        ingredient_name=ing["name"], unit=ing["unit"],
                        total_cost=round(qty * body.unit_cost, 2),
                        by_name=user["name"]).model_dump()
    await db.ingredients.update_one({"id": ing["id"]}, {"$inc": {"stock": qty},
                                    "$set": {"cost_per_unit": new_cost, "updated_at": now()}})
    await db.purchases.insert_one(dict(purchase))
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type="entrada",
        qty=qty, note=f"Compra {purchase['id'][:8]} - {supplier['name']}",
        by_name=user["name"]).model_dump())
    return purchase


@router.get("/purchases/expiry")
async def purchase_expiry(_: dict = Depends(require("caixa"))):
    today = date.today()
    purchases = await db.purchases.find({"expiry_date": {"$nin": [None, ""]}}, {"_id": 0}).to_list(5000)
    result = []
    for p in purchases:
        try:
            days = (date.fromisoformat(p["expiry_date"]) - today).days
        except (ValueError, KeyError):
            continue
        if days <= 7:
            result.append({**p, "days_to_expiry": days})
    return sorted(result, key=lambda p: p["days_to_expiry"])


# ---------- ingredients / stock ----------
@router.get("/ingredients", response_model=list[Ingredient])
async def list_ingredients(_: dict = Depends(current_user)):
    return await db.ingredients.find({}, {"_id": 0}).sort("name", 1).to_list(5000)


@router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(body: IngredientIn, _: dict = Depends(require())):
    i = Ingredient(**body.model_dump()).model_dump()
    await db.ingredients.insert_one(dict(i))
    return i


@router.put("/ingredients/{id}", response_model=Ingredient)
async def update_ingredient(id: str, body: IngredientIn, _: dict = Depends(require())):
    res = await db.ingredients.find_one_and_update(
        {"id": id}, {"$set": {**body.model_dump(), "updated_at": now()}}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Insumo não encontrado")
    return res


@router.delete("/ingredients/{id}", response_model=OkOut)
async def delete_ingredient(id: str, _: dict = Depends(require())):
    if await db.products.find_one({"recipe.ingredient_id": id}):
        raise HTTPException(400, "Insumo usado em ficha técnica de produto")
    await db.ingredients.delete_one({"id": id})
    return OkOut()


@router.get("/production/batches", response_model=list[ProductionBatch])
async def production_batches(_: dict = Depends(require("caixa", "cozinha"))):
    return await db.production_batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@router.post("/production/batches", response_model=ProductionBatch)
async def create_production_batch(body: ProductionBatchIn, user: dict = Depends(require("caixa", "cozinha"))):
    import math
    if not all(math.isfinite(v) for v in (body.kg, body.purchase_cost, body.extra_cost)):
        raise HTTPException(400, "Valores de produção inválidos")
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0})
    if not ing or ing.get("unit") != "kg":
        raise HTTPException(400, "Selecione um insumo cadastrado em kg")
    if body.product_id and not await db.products.find_one({"id": body.product_id}):
        raise HTTPException(400, "Produto de venda não encontrado")
    total = round(body.purchase_cost + body.extra_cost, 2)
    batch = ProductionBatch(**body.model_dump(), ingredient_name=ing["name"],
                            units_per_kg=round(body.units / body.kg, 4),
                            total_cost=total, cost_per_unit=round(total / body.units, 4),
                            by_name=user["name"]).model_dump()
    await db.production_batches.insert_one(dict(batch))
    if body.product_id:
        # Explicit association updates product costing. It does not change stock:
        # sales still deduct ingredients through the existing recipe.
        await db.products.update_one({"id": body.product_id}, {"$set": {"cost_price": round(batch["cost_per_unit"], 2)}})
    # Store the most recent yield for production estimates; inventory quantities
    # are not changed because purchase/production stock entries are separate.
    await db.ingredients.update_one({"id": ing["id"]}, {"$set": {
        "units_per_kg": batch["units_per_kg"], "updated_at": now()}})
    return batch


@router.get("/stock/moves", response_model=list[StockMove])
async def list_moves(_: dict = Depends(require("caixa", "cozinha"))):
    return await db.stock_moves.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@router.post("/stock/moves", response_model=Ingredient)
async def create_move(body: StockMoveIn, user: dict = Depends(require("caixa", "cozinha"))):
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Insumo não encontrado")
    if body.type == "perda":
        if not body.reason:
            raise HTTPException(400, "Informe o motivo da perda")
        if not body.qty > 0 or not __import__("math").isfinite(body.qty):
            raise HTTPException(400, "Quantidade da perda deve ser positiva e finita")
        # Conditional atomic decrement prevents recording losses greater than the stock.
        result = await db.ingredients.update_one(
            {"id": ing["id"], "stock": {"$gte": body.qty}},
            {"$inc": {"stock": -round(body.qty, 4)}, "$set": {"updated_at": now()}},
        )
        if not result.modified_count:
            raise HTTPException(409, "Estoque insuficiente para registrar a perda")
        delta = -round(body.qty, 4)
    else:
        if not __import__("math").isfinite(body.qty):
            raise HTTPException(400, "Quantidade inválida")
        if body.type == "ajuste":
            delta = body.qty - ing["stock"]
        else:
            if body.qty <= 0:
                raise HTTPException(400, "Quantidade deve ser maior que zero")
            delta = body.qty if body.type == "entrada" else -body.qty
        await db.ingredients.update_one({"id": ing["id"]}, {"$inc": {"stock": round(delta, 4)}, "$set": {"updated_at": now()}})
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type=body.type, qty=round(delta, 4),
        note=body.note, by_name=user["name"],
        reason=body.reason or "" if body.type == "perda" else "",
        cost_total=round(abs(delta) * ing.get("cost_per_unit", 0), 2) if body.type == "perda" else 0,
    ).model_dump())
    return await db.ingredients.find_one({"id": ing["id"]}, {"_id": 0})
