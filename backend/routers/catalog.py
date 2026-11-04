from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require
from lib.db import db
from lib.orders import ingredient_map, now, product_cost
from models.schemas import (Category, CategoryIn, Ingredient, IngredientIn, OkOut, Product, ProductIn,
                            StockMove, StockMoveIn)

router = APIRouter()


def with_cost(p: dict, ings: dict) -> dict:
    cost = product_cost(p, ings)
    p["cost"] = cost
    p["margin_pct"] = round((p["price"] - cost) / p["price"] * 100, 1) if p["price"] else 0
    return p


async def products_with_cost(q: dict) -> list[dict]:
    ings = await ingredient_map()
    return [with_cost(p, ings) for p in await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(2000)]


# ---------- categories ----------
@router.get("/categories", response_model=list[Category])
async def list_categories(_: dict = Depends(current_user)):
    return await db.categories.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(500)


@router.post("/categories", response_model=Category)
async def create_category(body: CategoryIn, _: dict = Depends(require())):
    c = Category(**body.model_dump()).model_dump()
    await db.categories.insert_one(dict(c))
    return c


@router.put("/categories/{id}", response_model=Category)
async def update_category(id: str, body: CategoryIn, _: dict = Depends(require())):
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


@router.get("/stock/moves", response_model=list[StockMove])
async def list_moves(_: dict = Depends(require("caixa", "cozinha"))):
    return await db.stock_moves.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@router.post("/stock/moves", response_model=Ingredient)
async def create_move(body: StockMoveIn, user: dict = Depends(require("caixa", "cozinha"))):
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Insumo não encontrado")
    if body.type == "ajuste":
        delta = body.qty - ing["stock"]
    else:
        if body.qty <= 0:
            raise HTTPException(400, "Quantidade deve ser maior que zero")
        delta = body.qty if body.type == "entrada" else -body.qty
    await db.ingredients.update_one({"id": ing["id"]}, {"$inc": {"stock": round(delta, 4)}, "$set": {"updated_at": now()}})
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type=body.type, qty=round(delta, 4),
        note=body.note, by_name=user["name"]).model_dump())
    return await db.ingredients.find_one({"id": ing["id"]}, {"_id": 0})
