from datetime import date, datetime, timedelta, timezone
import math
from uuid import NAMESPACE_URL, uuid5

from bson import ObjectId
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from lib.audit import audit_event
from lib.inventory_recovery import counter_stock_evidence, recovery_token
from lib.auth import current_user, require
from lib.db import db
from lib.orders import ingredient_map, local_today, now, product_cost
from models.schemas import (BulkDeleteIn, Category, CategoryIn, Ingredient, IngredientIn, IngredientUpdateIn, OkOut, Product, ProductIn, Supplier, SupplierIn,
                            StockMove, StockMoveIn, ProductionBatch, ProductionBatchIn, Purchase, PurchaseIn, InventoryCount, InventoryCountIn, LotCountIn)

from routers.operations import with_order_transaction

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
    if body.stock_ingredient_id and not await db.ingredients.find_one(
        {"id": body.stock_ingredient_id, "unit": body.sale_unit}, {"_id": 1},
    ):
        raise HTTPException(400, "Selecione um item de estoque na mesma unidade do produto")
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
    omitted = {"sale_unit", "channels", "stock_ingredient_id"} - body.model_fields_set
    link_fields = {"sale_unit", "stock_ingredient_id"}
    missing_link_fields = link_fields & omitted
    query = {"id": id}
    if len(missing_link_fields) == 1:
        # A legacy client may send only one half of the inventory linkage.
        missing_field, = missing_link_fields
        current = await db.products.find_one(query, {"_id": 0, missing_field: 1})
        if current is None:
            raise HTTPException(404, "Produto não encontrado")
        query[missing_field] = current.get(missing_field)
        saved_value = current.get(missing_field, getattr(body, missing_field))
        body = body.model_copy(update={missing_field: saved_value})

    await _validate_product(body)
    fields = body.model_dump(exclude=omitted)
    res = await db.products.find_one_and_update(query, {"$set": fields}, projection={"_id": 0}, return_document=True)
    if not res:
        if len(missing_link_fields) == 1 and await db.products.find_one({"id": id}, {"_id": 1}):
            raise HTTPException(409, "O vínculo de estoque mudou. Reabra o produto antes de salvar.")
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
    if not body.client_ref:
        return await apply_purchase(body, user)
    purchase_id = str(uuid5(NAMESPACE_URL, f"apollo-purchase:{user['id']}:{body.client_ref}"))
    expected = {**body.model_dump(), "qty": round(body.qty, 4)}

    def verify_replay(previous):
        if any(previous.get(key) != value for key, value in expected.items()):
            raise HTTPException(409, "Referência de compra já usada com outros dados")
        return previous

    topology = await db.command("hello")
    if not (topology.get("setName") or topology.get("msg") == "isdbgrid"):
        return await register_standalone_purchase(body, user, purchase_id, expected, verify_replay)

    async def apply(session):
        attempt = await db.purchase_attempts.find_one({"_id": purchase_id}, session=session)
        if attempt and not attempt.get("completed"):
            raise HTTPException(409, "Compra já iniciada e ainda sem confirmação. Confira o estoque antes de repetir.")
        previous = await db.purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
        if previous:
            return verify_replay(previous)
        return await apply_purchase(body, user, purchase_id=purchase_id, session=session)

    try:
        async with await db.client.start_session() as session:
            return await session.with_transaction(apply)
    except DuplicateKeyError:
        previous = await db.purchases.find_one({"id": purchase_id}, {"_id": 0})
        if previous:
            return verify_replay(previous)
        raise


async def register_standalone_purchase(body, user, purchase_id, expected, verify_replay):
    pending = "Compra já iniciada e ainda sem confirmação. Confira o estoque antes de repetir."
    attempts = db.purchase_attempts
    attempt = await attempts.find_one({"_id": purchase_id})
    previous = await db.purchases.find_one({"id": purchase_id}, {"_id": 0})
    if attempt:
        if attempt["fingerprint"] != recovery_token(expected):
            raise HTTPException(409, "Referência de compra já usada com outros dados")
        if attempt.get("completed") and previous:
            return verify_replay(previous)
        raise HTTPException(409, pending)
    if previous:
        # A prior transaction may have completed before the server switched topology.
        return verify_replay(previous)

    async def reserve():
        try:
            await attempts.insert_one({"_id": purchase_id, "fingerprint": recovery_token(expected),
                                       "completed": False, "created_at": now()})
        except DuplicateKeyError as error:
            raise HTTPException(409, pending) from error

    result = await apply_purchase(body, user, purchase_id=purchase_id, reserve=reserve)
    await attempts.update_one({"_id": purchase_id}, {"$set": {"completed": True}})
    return result


async def apply_purchase(body: PurchaseIn, user: dict, *, purchase_id: str | None = None, session=None, reserve=None):
    options = {"session": session} if session is not None else {}
    supplier = await db.suppliers.find_one({"id": body.supplier_id}, {"_id": 0}, **options)
    ing = await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0}, **options)
    product = await db.products.find_one({"id": body.product_id}, {"_id": 0}, **options) if body.product_id else None
    if body.product_id and (not product or product.get("stock_ingredient_id") != body.ingredient_id
                            or product.get("sale_unit", "un") != (ing or {}).get("unit")):
        raise HTTPException(409, "Produto sem vínculo de estoque válido para esta compra")
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado")
    if not ing:
        raise HTTPException(404, "Insumo não encontrado")
    try:
        manufactured = date.fromisoformat(body.manufactured_on) if body.manufactured_on else None
        expiry = date.fromisoformat(body.expiry_date) if body.expiry_date else None
    except ValueError:
        raise HTTPException(400, "Datas do lote devem estar no formato AAAA-MM-DD") from None
    today = date.fromisoformat(local_today())
    if manufactured and (manufactured > today or (expiry and manufactured > expiry)):
        raise HTTPException(400, "A fabricação deve ser anterior ou igual à data atual e à validade")
    if expiry and expiry < today:
        raise HTTPException(400, "Não é possível cadastrar compra já vencida")
    qty = round(body.qty, 4)
    if qty <= 0:
        raise HTTPException(400, "Quantidade muito pequena")
    if ing["unit"] == "un" and qty != int(qty):
        raise HTTPException(400, "Compras por unidade exigem quantidades inteiras")
    total_cost = qty * body.unit_cost
    if not math.isfinite(total_cost):
        raise HTTPException(400, "Custo total da compra fora do limite")
    purchase = Purchase(**{**body.model_dump(), "qty": qty}, supplier_name=supplier["name"],
                        ingredient_name=ing["name"], product_name=product["name"] if product else "", unit=ing["unit"],
                        total_cost=round(total_cost, 2),
                        by_name=user["name"]).model_dump()
    if purchase_id:
        purchase["id"] = purchase_id
    # Calculate the average from the same document revision that receives the stock.
    current_stock = {"$ifNull": ["$stock", 0]}
    positive_stock = {"$max": [0, current_stock]}
    positive_cost = {"$max": [0, {"$ifNull": ["$cost_per_unit", 0]}]}
    if reserve is not None:
        await reserve()
    updated = await db.ingredients.update_one({"id": ing["id"], "unit": ing["unit"]}, [{"$set": {
        "stock": {"$add": [current_stock, qty]},
        "cost_per_unit": {"$round": [{"$divide": [
            {"$add": [{"$multiply": [positive_stock, positive_cost]}, total_cost]},
            {"$add": [positive_stock, qty]},
        ]}, 4]},
        "updated_at": now(),
    }}], **options)
    if updated.matched_count != 1:
        raise HTTPException(409, "O insumo foi alterado. Atualize o estoque antes de registrar a compra.")
    purchase['remaining_qty'] = qty
    document = {**purchase, "_id": purchase_id} if purchase_id else dict(purchase)
    await db.purchases.insert_one(document, **options)
    await db.stock_moves.insert_one(StockMove(
        ingredient_id=ing["id"], ingredient_name=ing["name"], type="entrada",
        qty=qty, note=f"Compra {purchase['id'][:8]} - {supplier['name']}",
        by_name=user["name"]).model_dump(), **options)
    return purchase


@router.get("/purchases/expiry")
async def purchase_expiry(_: dict = Depends(require("caixa"))):
    today = date.fromisoformat(local_today())
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
    return await with_order_transaction(lambda session: apply_lot_count(body, user, session=session))


async def apply_lot_count(body: LotCountIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    purchase = await db.purchases.find_one({"id": body.purchase_id}, {"_id": 0}, **options)
    if not purchase or "remaining_qty" not in purchase:
        raise HTTPException(404, "Lote não encontrado")
    ingredient_id = purchase["ingredient_id"]
    if not await db.ingredients.find_one({"id": ingredient_id}, {"_id": 1}, **options):
        raise HTTPException(409, "O insumo vinculado ao lote não está disponível")
    counted = round(body.counted_qty, 4)
    previous = round(float(purchase["remaining_qty"]), 4)
    delta = round(counted - previous, 4)
    result = await db.purchases.update_one(
        {"id": body.purchase_id, "remaining_qty": purchase["remaining_qty"]},
        {"$set": {"remaining_qty": counted}}, **options)
    if result.matched_count != 1:
        raise HTTPException(409, "Lote alterado durante a conferência")
    stock = await db.ingredients.update_one(
        {"id": ingredient_id}, {"$inc": {"stock": delta}, "$set": {"updated_at": now()}}, **options)
    if stock.matched_count != 1:
        raise HTTPException(409, "O insumo foi alterado durante a conferência")
    await db.inventory_counts.insert_one({
        "id": __import__("uuid").uuid4().hex, "ingredient_id": ingredient_id,
        "purchase_id": purchase["id"], "counted_qty": counted, "previous_qty": previous,
        "difference": delta, "note": body.note, "by_name": user["name"], "created_at": now()}, **options)
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
        maximum = ing.get("max_stock")
        if maximum is not None and stock > maximum:
            alerts.append({
                "ingredient_id": ing["id"], "name": ing["name"], "unit": ing.get("unit", ""),
                "stock": round(stock, 4), "min_stock": round(minimum, 4), "max_stock": maximum,
                "missing_to_min": 0, "excess": round(stock - maximum, 4),
                "severity": "excesso", "estimated_minimum_cost": 0,
            })
    return sorted(alerts, key=lambda a: (a["severity"] != "sem_estoque", a["name"].casefold()))


@router.get("/inventory/alerts")
async def inventory_alerts(_: dict = Depends(require("caixa", "cozinha"))):
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(5000)
    alerts = stock_alerts(ingredients)
    return {"total": len(alerts), "out_of_stock": sum(a["severity"] == "sem_estoque" for a in alerts),
            "low_stock": sum(a["severity"] == "baixo" for a in alerts),
            "overstock": sum(a["severity"] == "excesso" for a in alerts),
            "estimated_minimum_cost": round(sum(a["estimated_minimum_cost"] for a in alerts), 2),
            "items": alerts}


@router.get("/inventory/reconciliation")
async def inventory_reconciliation(_: dict = Depends(require())):
    """Read-only evidence for administrative review; never link or adjust a lot here."""
    legacy = await db.lot_consumptions.find(
        {"stock_ref": {"$in": [None, ""]}, "historical_order_id": {"$exists": False}},
        {"purchase_id": 1, "ingredient_id": 1, "lot_number": 1, "qty": 1,
         "restored_qty": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(101)
    pending = await db.orders.find(
        {"stock_completion": "pending", "$or": [{"channel": "balcao", "status": "pago"},
         {"channel": "delivery", "status": "aberto", "delivery_status": "aceito"}]},
        {"_id": 0, "id": 1, "number": 1, "paid_at": 1, "channel": 1},
    ).sort("paid_at", -1).to_list(101)
    balances = await db.purchases.aggregate([
        {"$match": {"remaining_qty": {"$gt": 0}}},
        {"$group": {"_id": "$ingredient_id", "tracked": {"$sum": "$remaining_qty"}}},
        {"$lookup": {"from": "ingredients", "localField": "_id", "foreignField": "id", "as": "ingredient"}},
        {"$set": {"stock": {"$ifNull": [{"$arrayElemAt": ["$ingredient.stock", 0]}, 0]},
                  "name": {"$arrayElemAt": ["$ingredient.name", 0]}}},
        {"$set": {"difference": {"$round": [{"$subtract": ["$tracked", "$stock"]}, 4]}}},
        {"$match": {"difference": {"$gt": 0}}},
        {"$sort": {"difference": -1, "_id": 1}},
        {"$limit": 101},
        {"$project": {"_id": 0, "ingredient_id": "$_id", "name": 1, "stock": 1, "tracked": 1, "difference": 1}},
    ]).to_list(101)
    return {"legacy_lots": [{**{key: value for key, value in row.items() if key != "_id"},
                              "review_id": str(row["_id"])} for row in legacy[:100]], "pending_sales": pending[:100], "lot_excess": balances[:100],
            "truncated": any(len(rows) > 100 for rows in (legacy, pending, balances))}


class ReconciliationApproval(BaseModel):
    token: str = Field(pattern=r"^[0-9a-f]{64}$")
    reason: str = Field(min_length=10, max_length=500)
    confirmed: bool


async def pending_sale_preview(order_id: str):
    order = await db.orders.find_one({"id": order_id, "stock_completion": "pending",
                                      "$or": [{"channel": "balcao", "status": "pago"},
                                              {"channel": "delivery", "status": "aberto", "delivery_status": "aceito"}]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Pedido com baixa pendente não encontrado")
    prefix = "Delivery #" if order.get("channel") == "delivery" else "PDV · Pedido #"
    moves = await db.stock_moves.find({"note": f"{prefix}{order['number']}", "type": "venda"},
                                       {"_id": 0, "ingredient_id": 1, "qty": 1}).to_list(1001)
    if len(moves) > 1000:
        raise HTTPException(409, "Movimentações demais para uma conferência individual")
    evidence = counter_stock_evidence(order, moves)
    snapshot = {"id": order_id, "number": order["number"], "items": order["items"], **evidence}
    return order, {"order_number": order["number"], **evidence, "token": recovery_token(snapshot)}


@router.get("/inventory/reconciliation/sales/{order_id}")
async def preview_pending_sale(order_id: str, _: dict = Depends(require())):
    _, preview = await pending_sale_preview(order_id)
    return preview


@router.post("/inventory/reconciliation/sales/{order_id}/approve")
async def approve_pending_sale(order_id: str, body: ReconciliationApproval, user: dict = Depends(require())):
    order, preview = await pending_sale_preview(order_id)
    if not body.confirmed or preview["token"] != body.token or not preview["matches"] or len(body.reason.strip()) < 10:
        raise HTTPException(409, "Evidência insuficiente ou alterada. Confira a prévia novamente.")
    result = await db.orders.update_one(
        {"id": order_id, "status": order["status"], "delivery_status": order.get("delivery_status"),
         "stock_completion": "pending", "items": order["items"]},
        {"$set": {"stock_completion": "complete"},
         "$push": {"audit_events": audit_event("stock_completion_reviewed", user, reason=body.reason.strip(), correlation=body.token,
                                              values={"order_number": order["number"]})}},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Venda alterada durante a revisão")
    return {"ok": True}


async def historical_lot_preview(review_id: str, order_number: int):
    if not ObjectId.is_valid(review_id):
        raise HTTPException(404, "Registro histórico não encontrado")
    lot = await db.lot_consumptions.find_one({"_id": ObjectId(review_id),
                                               "stock_ref": {"$in": [None, ""]},
                                               "historical_order_id": {"$exists": False}})
    if not lot:
        raise HTTPException(404, "Registro histórico já revisado ou não encontrado")
    orders = await db.orders.find({"number": order_number, "channel": {"$in": ["balcao", "delivery"]}},
                                   {"_id": 0, "id": 1, "number": 1, "channel": 1}).to_list(2)
    prefixes = {"balcao": "PDV · Pedido #", "delivery": "Delivery #"}
    if len(orders) != 1 or lot.get("note") != f"{prefixes[orders[0]['channel']]}{order_number}":
        raise HTTPException(409, "A anotação histórica não comprova o vínculo com esse pedido")
    order = orders[0]
    evidence = {"review_id": review_id, "order_id": order["id"], "order_number": order_number,
                "ingredient_id": lot["ingredient_id"], "purchase_id": lot["purchase_id"],
                "qty": lot["qty"], "restored_qty": lot.get("restored_qty", 0)}
    return lot, {**evidence, "token": recovery_token(evidence)}


@router.get("/inventory/reconciliation/lots/{review_id}")
async def preview_historical_lot(review_id: str, order_number: int, _: dict = Depends(require())):
    _, preview = await historical_lot_preview(review_id, order_number)
    return preview


@router.post("/inventory/reconciliation/lots/{review_id}/approve")
async def approve_historical_lot(review_id: str, order_number: int, body: ReconciliationApproval,
                                 user: dict = Depends(require())):
    lot, preview = await historical_lot_preview(review_id, order_number)
    if not body.confirmed or preview["token"] != body.token or len(body.reason.strip()) < 10:
        raise HTTPException(409, "Evidência alterada. Confira a prévia novamente.")
    result = await db.lot_consumptions.update_one(
        {"_id": lot["_id"], "stock_ref": {"$in": [None, ""]}, "historical_order_id": {"$exists": False},
         "note": lot["note"], "qty": lot["qty"], "purchase_id": lot["purchase_id"],
         "restored_qty": lot.get("restored_qty", {"$exists": False})},
        {"$set": {"historical_order_id": preview["order_id"],
                  "historical_review": audit_event("historical_lot_linked", user, reason=body.reason.strip(), correlation=body.token,
                                                   values={"order_number": order_number, "purchase_id": lot["purchase_id"]})}},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Lote alterado durante a revisão")
    return {"ok": True}


@router.get("/inventory/movement-report")
async def inventory_movement_report(days: int = Query(default=30, ge=1, le=90), _: dict = Depends(require("caixa"))):
    end = now()
    date_range = {"$gte": end - timedelta(days=days), "$lte": end}
    movements = await db.stock_moves.aggregate([
        {"$match": {"created_at": date_range}},
        {"$group": {"_id": {"ingredient_id": "$ingredient_id", "type": "$type"},
                    "name": {"$first": "$ingredient_name"}, "quantity": {"$sum": "$qty"},
                    "count": {"$sum": 1}, "recorded_cost": {"$sum": "$cost_total"}}},
        {"$sort": {"name": 1, "_id.type": 1, "_id.ingredient_id": 1}}, {"$limit": 1001},
        {"$project": {"_id": 0, "ingredient_id": "$_id.ingredient_id", "type": "$_id.type",
                      "name": 1, "quantity": {"$round": ["$quantity", 4]}, "count": 1,
                      "recorded_cost": {"$round": ["$recorded_cost", 2]}}},
    ]).to_list(1001)
    purchases = await db.purchases.aggregate([
        {"$match": {"created_at": date_range}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "cost": {"$sum": "$total_cost"}}},
        {"$project": {"_id": 0, "count": 1, "cost": {"$round": ["$cost", 2]}}},
    ]).to_list(1)
    return {"days": days, "movements": movements[:1000], "truncated": len(movements) > 1000,
            "purchases": purchases[0] if purchases else {"count": 0, "cost": 0}}


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
        maximum = ing.get("max_stock")
        if target is not None and maximum is not None and math.isfinite(maximum) and maximum >= minimum:
            target = min(target, maximum)
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
                                                "stock": 1, "min_stock": 1, "max_stock": 1, "cost_per_unit": 1}).to_list(5000)
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
        query, {"$set": {**body.model_dump(exclude={"expected_stock"} | ({"max_stock", "block_negative_stock"} - body.model_fields_set)), "updated_at": now()}},
        projection={"_id": 0}, return_document=True)
    if not res:
        if body.expected_stock is not None and await db.ingredients.find_one({"id": id}, {"_id": 0, "id": 1}):
            raise HTTPException(409, "O estoque mudou enquanto o formulário estava aberto. Feche e abra o insumo novamente antes de salvar.")
        raise HTTPException(404, "Insumo não encontrado")
    return res


@router.delete("/ingredients/{id}", response_model=OkOut)
async def delete_ingredient(id: str, _: dict = Depends(require())):
    if await db.products.find_one({"$or": [{"recipe.ingredient_id": id}, {"stock_ingredient_id": id}]}):
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
            stock_filter["$or"] = [{"stock": {"$gte": round(body.qty, 4)}}, {"block_negative_stock": False}]
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
