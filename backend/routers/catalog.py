from datetime import date, datetime, timedelta, timezone
import math

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_user, require
from lib.db import db
from lib.orders import ingredient_map, now, product_cost
from models.schemas import (BulkDeleteIn, Category, CategoryIn, Ingredient, IngredientIn, IngredientUpdateIn, OkOut, Product, ProductIn, Supplier, SupplierIn,
                            StockMove, StockMoveIn, ProductionBatch, ProductionBatchIn, Purchase, PurchaseIn, InventoryCount, InventoryCountIn, LotCountIn)

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
    body.name = body.name.strip()
    body.code = body.code.strip()
    if not body.name:
        raise HTTPException(400, "Informe o nome do produto")
    body.channels = list(dict.fromkeys(body.channels))
    if not await db.categories.find_one({"id": body.category_id}):
        raise HTTPException(400, "Categoria inválida")
    await _check_station(body.station)
    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000) if body.options else []
    names = {product["name"].strip().lower(): product["id"] for product in products}
    product_ids = {product["id"] for product in products}
    group_names = set()
    for group in body.options:
        group.name = group.name.strip()
        if not group.name or group.name.casefold() in group_names:
            raise HTTPException(400, "Informe nomes distintos para os grupos de opções")
        group_names.add(group.name.casefold())
        choice_names = set()
        for choice in group.choices:
            choice.name = choice.name.strip()
            if not choice.name or choice.name.casefold() in choice_names:
                raise HTTPException(400, f"Informe opções com nomes distintos em {group.name}")
            choice_names.add(choice.name.casefold())
            if choice.product_id not in product_ids:
                choice.product_id = names.get(choice.name.lower())
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
    fields = body.model_dump(exclude={"sale_unit", "channels"} - body.model_fields_set)
    res = await db.products.find_one_and_update({"id": id}, {"$set": fields}, projection={"_id": 0}, return_document=True)
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
    total_cost = qty * body.unit_cost
    if not math.isfinite(total_cost):
        raise HTTPException(400, "Custo total da compra fora do limite")
    purchase = Purchase(**{**body.model_dump(), "qty": qty}, supplier_name=supplier["name"],
                        ingredient_name=ing["name"], unit=ing["unit"],
                        total_cost=round(total_cost, 2),
                        by_name=user["name"]).model_dump()
    # Calculate the average from the same document revision that receives the stock.
    current_stock = {"$ifNull": ["$stock", 0]}
    positive_stock = {"$max": [0, current_stock]}
    positive_cost = {"$max": [0, {"$ifNull": ["$cost_per_unit", 0]}]}
    updated = await db.ingredients.update_one({"id": ing["id"], "unit": ing["unit"]}, [{"$set": {
        "stock": {"$add": [current_stock, qty]},
        "cost_per_unit": {"$round": [{"$divide": [
            {"$add": [{"$multiply": [positive_stock, positive_cost]}, total_cost]},
            {"$add": [positive_stock, qty]},
        ]}, 4]},
        "updated_at": now(),
    }}])
    if updated.matched_count != 1:
        raise HTTPException(409, "O insumo foi alterado. Atualize o estoque antes de registrar a compra.")
    purchase['remaining_qty'] = qty
    await db.purchases.insert_one(dict(purchase))
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type="entrada",
        qty=qty, note=f"Compra {purchase['id'][:8]} - {supplier['name']}",
        by_name=user["name"]).model_dump())
    return purchase


@router.get("/purchases/expiry")
async def purchase_expiry(_: dict = Depends(require("caixa"))):
    today = date.today()
    purchases = await db.purchases.find({"expiry_date": {"$nin": [None, ""]}, "remaining_qty": {"$gt": 0}}, {"_id": 0}).to_list(5000)
    result = []
    for p in purchases:
        try:
            days = (date.fromisoformat(p["expiry_date"]) - today).days
        except (ValueError, KeyError):
            continue
        if days <= 7:
            result.append({**p, "days_to_expiry": days})
    return sorted(result, key=lambda p: p["days_to_expiry"])



@router.get("/inventory/lots")
async def inventory_lots(_: dict = Depends(require("caixa"))):
    return await db.purchases.find({"remaining_qty": {"$exists": True}},
                                   {"_id": 0}).sort("expiry_date", 1).to_list(5000)


@router.post("/inventory/lots/count")
async def count_purchase_lot(body: LotCountIn, user: dict = Depends(require("caixa"))):
    purchase = await db.purchases.find_one({"id": body.purchase_id}, {"_id": 0})
    if not purchase or "remaining_qty" not in purchase:
        raise HTTPException(404, "Lote não encontrado")
    counted = round(body.counted_qty, 4)
    previous = round(float(purchase["remaining_qty"]), 4)
    delta = round(counted - previous, 4)
    result = await db.purchases.update_one(
        {"id": body.purchase_id, "remaining_qty": purchase["remaining_qty"]},
        {"$set": {"remaining_qty": counted}})
    if not result.modified_count and delta != 0:
        raise HTTPException(409, "Lote alterado durante a conferência")
    await db.ingredients.update_one({"id": purchase["ingredient_id"]},
                                    {"$inc": {"stock": delta}, "$set": {"updated_at": now()}})
    await db.inventory_counts.insert_one({
        "id": __import__("uuid").uuid4().hex, "ingredient_id": purchase["ingredient_id"],
        "purchase_id": purchase["id"], "counted_qty": counted, "previous_qty": previous,
        "difference": delta, "note": body.note, "by_name": user["name"], "created_at": now()})
    return {"ok": True, "difference": delta, "remaining_qty": counted}


@router.get("/inventory/lots/trace")
async def lot_trace(note: str = "", _: dict = Depends(require("caixa"))):
    if not note.strip():
        raise HTTPException(400, "Informe a referência da venda ou produção")
    return await db.lot_consumptions.find({"note": note}, {"_id": 0}).to_list(500)


@router.get("/inventory/counts", response_model=list[InventoryCount])
async def inventory_counts(_: dict = Depends(require("caixa"))):
    return await db.inventory_counts.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@router.post("/inventory/counts", response_model=InventoryCount)
async def register_inventory_count(body: InventoryCountIn, user: dict = Depends(require("caixa"))):
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Insumo não encontrado")
    counted = round(body.counted_qty, 4)
    previous = round(float(ing["stock"]), 4)
    diff = round(counted - previous, 4)
    count = InventoryCount(**{**body.model_dump(), "counted_qty": counted},
                           previous_qty=previous, difference=diff, by_name=user["name"]).model_dump()
    result = await db.ingredients.update_one(
        {"id": ing["id"], "stock": ing["stock"]},
        {"$set": {"stock": counted, "updated_at": now()}},
    )
    if not result.matched_count:
        raise HTTPException(409, "Estoque alterado durante o inventário. Atualize a quantidade e tente novamente.")
    await db.inventory_counts.insert_one(dict(count))
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type="ajuste",
        qty=diff, note=f"Inventário {count['id'][:8]}: {body.note}", by_name=user["name"]).model_dump())
    return count


# ---------- ingredients / stock ----------
@router.get("/ingredients", response_model=list[Ingredient])
async def list_ingredients(_: dict = Depends(current_user)):
    return await db.ingredients.find({}, {"_id": 0}).sort("name", 1).to_list(5000)


def stock_alerts(ingredients: list[dict]) -> list[dict]:
    """Pure stock-threshold evaluation; zero minimum disables low-stock alerts."""
    alerts = []
    for ing in ingredients:
        stock = float(ing.get("stock") or 0)
        minimum = float(ing.get("min_stock") or 0)
        if stock <= 0 or (minimum > 0 and stock < minimum):
            alerts.append({
                "ingredient_id": ing["id"], "name": ing["name"], "unit": ing.get("unit", ""),
                "stock": round(stock, 4), "min_stock": round(minimum, 4),
                "missing_to_min": round(max(0, minimum - stock), 4),
                "severity": "sem_estoque" if stock <= 0 else "baixo",
                "estimated_minimum_cost": round(max(0, minimum - stock) * float(ing.get("cost_per_unit") or 0), 2),
            })
    return sorted(alerts, key=lambda a: (a["severity"] != "sem_estoque", a["name"].casefold()))


@router.get("/inventory/alerts")
async def inventory_alerts(_: dict = Depends(require("caixa", "cozinha"))):
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(5000)
    alerts = stock_alerts(ingredients)
    return {"total": len(alerts), "out_of_stock": sum(a["severity"] == "sem_estoque" for a in alerts),
            "low_stock": sum(a["severity"] == "baixo" for a in alerts),
            "estimated_minimum_cost": round(sum(a["estimated_minimum_cost"] for a in alerts), 2),
            "items": alerts}


def replenishment_plan(ingredients: list[dict], target_multiplier: int = 2) -> dict:
    """Read-only threshold plan. Costs are estimates, never supplier quotes or purchase orders."""
    if target_multiplier not in (1, 2, 3):
        raise ValueError("Target multiplier must be 1, 2 or 3")
    items = []
    for ing in ingredients:
        try:
            stock = float(ing.get("stock") or 0)
            minimum = float(ing.get("min_stock") or 0)
        except (ValueError, TypeError):
            continue
        if not math.isfinite(stock) or not math.isfinite(minimum):
            continue
        minimum = max(0, minimum)
        if stock > 0 and (minimum == 0 or stock >= minimum):
            continue
        target = minimum * target_multiplier if minimum > 0 else None
        if target is not None and not math.isfinite(target - stock):
            continue
        suggested = max(0, target - stock) if target is not None else None
        if suggested is not None:
            suggested = math.ceil(suggested) if ing.get("unit") == "un" else round(suggested, 4)
        try:
            unit_cost = float(ing.get("cost_per_unit") or 0)
        except (ValueError, TypeError):
            unit_cost = 0
        has_cost = math.isfinite(unit_cost) and unit_cost > 0
        items.append({
            "ingredient_id": ing["id"], "name": ing["name"], "unit": ing.get("unit", ""),
            "stock": stock, "min_stock": minimum, "target_stock": target, "suggested": suggested,
            "estimated_cost": round(suggested * unit_cost, 2) if suggested is not None and has_cost and math.isfinite(suggested * unit_cost) else None,
            "review_required": minimum == 0 or stock < 0,
            "reason": "configure_minimum" if minimum == 0 else "negative_stock" if stock < 0 else "out_of_stock" if stock == 0 else "below_minimum",
        })
    items.sort(key=lambda i: (i["stock"] > 0, i["name"].casefold()))
    return {"target_multiplier": target_multiplier, "items": items, "total": len(items),
            "estimated_known_cost": round(sum(i["estimated_cost"] or 0 for i in items), 2),
            "items_without_cost": sum(i["estimated_cost"] is None for i in items),
            "review_required": sum(i["review_required"] for i in items)}


@router.get("/inventory/replenishment")
async def inventory_replenishment(target_multiplier: int = Query(default=2, ge=1, le=3),
                                  _: dict = Depends(require("caixa", "cozinha"))):
    ingredients = await db.ingredients.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1,
                                                "stock": 1, "min_stock": 1, "cost_per_unit": 1}).to_list(5000)
    return replenishment_plan(ingredients, target_multiplier)


def inventory_consumption_forecast(ingredients: list[dict], moves: list[dict], *, window_days: int,
                                   lead_days: int, buffer_days: int, as_of: datetime,
                                   history_truncated: bool = False) -> dict:
    """Planning only: gross sales consumption and losses are deliberately separate."""
    if not (7 <= window_days <= 90 and 1 <= lead_days <= 60 and 0 <= buffer_days <= 30):
        raise ValueError("Invalid forecast planning window")
    end = as_of.replace(tzinfo=timezone.utc) if as_of.tzinfo is None else as_of
    start = end - timedelta(days=window_days)
    totals = {}
    for move in moves:
        kind = move.get("type")
        if kind not in ("venda", "perda"):
            continue
        try:
            at = move["created_at"]
            if isinstance(at, str):
                at = datetime.fromisoformat(at.replace("Z", "+00:00"))
            if not isinstance(at, datetime):
                continue
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            qty = abs(float(move.get("qty", 0)))
        except (KeyError, ValueError, TypeError, OverflowError):
            continue
        if not (start <= at <= end) or not math.isfinite(qty) or qty == 0:
            continue
        total = totals.setdefault(move.get("ingredient_id"), {"sales": 0., "losses": 0., "days": set()})
        if kind == "venda":
            total["sales"] += qty
            total["days"].add(at.astimezone(timezone.utc).date())
        else:
            total["losses"] += qty
    items = []
    for ing in ingredients:
        try:
            stock = float(ing.get("stock") or 0)
            minimum = max(0, float(ing.get("min_stock") or 0))
        except (ValueError, TypeError, OverflowError):
            continue
        total = totals.get(ing["id"], {"sales": 0., "losses": 0., "days": set()})
        if not all(math.isfinite(v) for v in (stock, minimum, total["sales"], total["losses"])):
            continue
        average = total["sales"] / window_days
        insufficient = history_truncated or len(total["days"]) < 3
        target = max(minimum, average * (lead_days + buffer_days))
        needed = max(0, target - stock)
        if not math.isfinite(target) or not math.isfinite(needed * 10000):
            continue
        coverage = max(0, stock) / average if average > 0 else None
        if coverage is not None and not math.isfinite(coverage):
            coverage = None
        suggested = None if insufficient else math.ceil(needed) if ing.get("unit") == "un" else math.ceil(needed * 10000) / 10000
        items.append({"ingredient_id": ing["id"], "name": ing["name"], "unit": ing.get("unit", ""),
                      "stock": stock, "min_stock": minimum, "sales_consumption": round(total["sales"], 4),
                      "loss_qty": round(total["losses"], 4), "sales_days": len(total["days"]),
                      "daily_average": round(average, 4),
                      "coverage_days": round(coverage, 1) if coverage is not None else None,
                      "target_stock": round(target, 4) if not insufficient else None,
                      "suggested": suggested, "insufficient_history": insufficient,
                      "review_negative_stock": stock < 0})
    items.sort(key=lambda i: (i["insufficient_history"], -(i["suggested"] or 0), i["name"].casefold()))
    return {"window_days": window_days, "lead_days": lead_days, "buffer_days": buffer_days,
            "as_of": end, "history_truncated": history_truncated, "minimum_sales_days": 3,
            "insufficient_history_count": sum(i["insufficient_history"] for i in items), "items": items}


@router.get("/inventory/forecast")
async def inventory_forecast(window_days: int = Query(default=28, ge=7, le=90),
                             lead_days: int = Query(default=7, ge=1, le=60),
                             buffer_days: int = Query(default=2, ge=0, le=30),
                             _: dict = Depends(require("caixa", "cozinha"))):
    as_of = now()
    ingredients = await db.ingredients.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1,
                                                "stock": 1, "min_stock": 1}).to_list(5000)
    moves = await db.stock_moves.find({"type": {"$in": ["venda", "perda"]},
                                      "created_at": {"$gte": as_of - timedelta(days=window_days), "$lte": as_of}},
                                     {"_id": 0, "ingredient_id": 1, "type": 1, "qty": 1, "created_at": 1}).to_list(50001)
    return inventory_consumption_forecast(ingredients, moves[:50000], window_days=window_days,
                                          lead_days=lead_days, buffer_days=buffer_days, as_of=as_of,
                                          history_truncated=len(moves) > 50000)


@router.post("/ingredients", response_model=Ingredient)
async def create_ingredient(body: IngredientIn, _: dict = Depends(require())):
    i = Ingredient(**body.model_dump()).model_dump()
    await db.ingredients.insert_one(dict(i))
    return i


@router.put("/ingredients/{id}", response_model=Ingredient)
async def update_ingredient(id: str, body: IngredientUpdateIn, _: dict = Depends(require())):
    query = {"id": id}
    if body.expected_stock is not None:
        query["stock"] = body.expected_stock
    res = await db.ingredients.find_one_and_update(
        query, {"$set": {**body.model_dump(exclude={"expected_stock"}), "updated_at": now()}},
        projection={"_id": 0}, return_document=True)
    if not res:
        if body.expected_stock is not None and await db.ingredients.find_one({"id": id}, {"_id": 0, "id": 1}):
            raise HTTPException(409, "O estoque mudou enquanto o formulário estava aberto. Feche e abra o insumo novamente antes de salvar.")
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
        stock_filter = {"id": ing["id"]}
        if body.type == "ajuste":
            # A manual absolute count must not overwrite intervening sales or receipts.
            stock_filter["stock"] = ing["stock"]
        elif body.type == "saida":
            stock_filter["stock"] = {"$gte": round(body.qty, 4)}
        result = await db.ingredients.update_one(
            stock_filter,
            {"$inc": {"stock": round(delta, 4)}, "$set": {"updated_at": now()}},
        )
        if not result.matched_count:
            raise HTTPException(409, "Estoque alterado ou insuficiente. Atualize e tente novamente.")
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type=body.type, qty=round(delta, 4),
        note=body.note, by_name=user["name"],
        reason=body.reason or "" if body.type == "perda" else "",
        cost_total=round(abs(delta) * ing.get("cost_per_unit", 0), 2) if body.type == "perda" else 0,
    ).model_dump())
    return await db.ingredients.find_one({"id": ing["id"]}, {"_id": 0})
