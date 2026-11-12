"""Unauthenticated endpoints used by the QR-code table menu and the own delivery site."""
import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from pymongo.errors import DuplicateKeyError

from lib.db import db
from lib.orders import build_items, create_ticket, move_stock, refresh_totals
from routers.catalog import products_with_cost
from routers.operations import with_order_transaction, create_delivery_order
from routers.tables import get_or_open_order, get_table
from models.schemas import SaleQuantity, CallIn, OkOut, PublicDeliveryIn, PublicMenu, PublicOrderIn, PublicOrderStatus, PublicTable, table_label

router = APIRouter(prefix="/public")
QR_WINDOW_SECONDS = 60
QR_MAX_REQUESTS = 12
QR_MAX_READS = 120


async def limit_table_actions(request: Request, table_id: str, *, read_only: bool = False) -> None:
    """Shared MongoDB rate limit per client and table, across application workers."""
    import hashlib
    ip = request.client.host if request.client else "unknown"
    key = hashlib.sha256(f"{ip}:{table_id}:{'read' if read_only else 'write'}".encode()).hexdigest()
    bucket = int(datetime.now(timezone.utc).timestamp()) // QR_WINDOW_SECONDS
    expires = datetime.now(timezone.utc) + timedelta(minutes=3)
    record = await db.public_qr_limits.find_one_and_update(
        {"_id": f"{key}:{bucket}"},
        {"$inc": {"attempts": 1}, "$setOnInsert": {"expires_at": expires}},
        upsert=True,
        return_document=True,
    )
    if record["attempts"] > (QR_MAX_READS if read_only else QR_MAX_REQUESTS):
        raise HTTPException(429, "Muitas solicitações para esta mesa. Aguarde um minuto.")

RESTAURANT = os.environ.get("RESTAURANT_NAME", "Espeteria Churras Burguer")


@router.get("/menu", response_model=PublicMenu)
async def menu(channel: Literal["qr", "delivery"] = "qr"):
    cats = await db.categories.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(500)
    prods = await products_with_cost({"active": True, "$or": [{"channels": channel}, {"channels": {"$exists": False}}]})
    for p in prods:  # never expose cost data publicly
        p["cost"], p["margin_pct"], p["recipe"], p["cost_price"] = 0, 0, [], 0
        p.pop("stock_ingredient_id", None)
    return {"restaurant": RESTAURANT, "categories": cats, "products": prods}


@router.get("/tables/{id}", response_model=PublicTable)
async def public_table(id: str, request: Request):
    await limit_table_actions(request, id, read_only=True)
    t = await get_table(id)
    order = await db.orders.find_one({"id": t.get("order_id"), "status": "aberto"}, {"_id": 0, "items": 1}) if t.get("order_id") else None
    consumed = [{"id": item.get("id", ""), "name": item.get("name", ""), "qty": item.get("qty", 0),
                 "unit_price": item.get("unit_price", 0)}
                for item in (order or {}).get("items", []) if not item.get("cancelled")]
    return {"id": t["id"], "number": t["number"], "label": table_label(t),
            "status": t["status"], "total": t.get("total", 0), "items": consumed}


@router.get("/tables/{id}/preparo")
async def public_table_preparation(id: str, request: Request):
    """Show only preparation stages for the current table order, never other tables."""
    await limit_table_actions(request, id, read_only=True)
    t = await get_table(id)
    if not t.get("order_id"):
        return {"tickets": []}
    cursor = db.kitchen_tickets.find(
        {"order_id": t["order_id"]},
        {"_id": 0, "id": 1, "status": 1, "items.name": 1,
         "items.qty": 1, "items.station": 1, "created_at": 1},
    ).sort("created_at", -1)
    tickets = await cursor.to_list(100)
    return {"tickets": [
        {"id": ticket["id"], "status": ticket.get("status", "novo"),
         "items": [{"name": item.get("name", ""), "qty": item.get("qty", 0),
                    "station": item.get("station", "cozinha")}
                   for item in ticket.get("items", [])]}
        for ticket in tickets
    ]}


class SplitRequestIn(BaseModel):
    quantities: dict[str, SaleQuantity] = Field(min_length=1, max_length=100)


@router.post("/tables/{id}/split-request")
async def request_table_split(id: str, body: SplitRequestIn, request: Request):
    """Customer requests a read-only item split; only staff can accept payment."""
    await limit_table_actions(request, id)
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Mesa sem comanda aberta")
    order = await db.orders.find_one({"id": t["order_id"], "status": "aberto"},
                                     {"_id": 0, "items": 1, "id": 1})
    if not order:
        raise HTTPException(409, "Comanda não está aberta")
    available = {i["id"]: i for i in order["items"] if not i.get("cancelled")}
    chosen = []
    for item_id, qty in body.quantities.items():
        item = available.get(item_id)
        if not item or isinstance(qty, bool) or qty <= 0 or qty > item["qty"] or (item.get("sale_unit", "un") == "un" and qty != int(qty)):
            raise HTTPException(400, "Seleção inválida. Atualize o consumo e tente novamente.")
        chosen.append({"item_id": item_id, "name": item["name"], "qty": qty,
                       "unit_price": item["unit_price"]})
    # Replace any pending customer request for the same table/order.
    request = {"id": str(uuid4()), "table_id": id, "order_id": order["id"],
               "quantities": body.quantities, "items": chosen,
               "subtotal": round(sum(i["qty"] * i["unit_price"] for i in chosen), 2),
               "created_at": datetime.now(timezone.utc)}
    await db.tables.update_one({"id": id, "order_id": order["id"]},
                               {"$set": {"split_request": request, "call": "conta"}})
    return {"message": "Solicitação enviada ao caixa para conferência", "subtotal": request["subtotal"]}


@router.post("/tables/{id}/order", response_model=PublicTable)
async def public_table_order(id: str, body: PublicOrderIn, request: Request):
    await limit_table_actions(request, id)
    return await with_order_transaction(lambda session: apply_public_table_order(id, body, session=session))


async def apply_public_table_order(id: str, body: PublicOrderIn, *, session=None):
    options = {"session": session} if session is not None else {}
    t = await get_table(id, **options)
    if t["status"] in ("reservada", "conta"):
        raise HTTPException(409, "Mesa indisponível para novos pedidos. Chame um garçom.")
    items = await build_items(body.items, channel="qr")
    order = await get_or_open_order(t, None, source="cardapio", **options)
    updated = await db.orders.update_one({"id": order["id"], "status": "aberto"}, {"$push": {"items": {"$each": [i.model_dump() for i in items]}}}, **options)
    if updated.modified_count != 1:
        raise HTTPException(409, "A comanda foi fechada. Atualize a mesa e tente novamente.")
    await create_ticket(order, items, **options)
    await move_stock(items, "Cardápio QR", f"{table_label(t)} · QR", **options)
    o = await refresh_totals(order["id"], **options)
    return {"id": t["id"], "number": t["number"], "label": table_label(t), "status": "ocupada", "total": o["total"]}


@router.post("/tables/{id}/call", response_model=OkOut)
async def public_call(id: str, body: CallIn, request: Request):
    await limit_table_actions(request, id)
    await get_table(id)
    await db.tables.update_one({"id": id}, {"$set": {"call": body.type}})
    return OkOut(message="Garçom chamado" if body.type == "garcom" else "Conta solicitada")


@router.post("/delivery", response_model=PublicOrderStatus)
async def public_delivery(body: PublicDeliveryIn):
    c = body.customer
    if len(c.name.strip()) < 2 or len(c.phone.strip()) < 8 or len(c.address.strip()) < 5:
        raise HTTPException(400, "Informe nome, telefone e endereço completos")
    items = await build_items(body.items, channel="delivery")
    o = await create_delivery_order("site", items, c.model_dump(), pay_on_delivery=body.payment_method)
    # Never let a CRM failure make a successfully created order look unsuccessful.
    try:
        from models.schemas import FiadoCustomer
        phone_digits = "".join(ch for ch in c.phone if ch.isdigit())
        if phone_digits:
            existing = await db.fiado_customers.find_one({
                "$or": [{"phone_digits": phone_digits}, {"phone": c.phone.strip()}]
            }, {"_id": 1})
            if not existing:
                customer = FiadoCustomer(name=c.name.strip(), phone=c.phone.strip(),
                                         address=c.address.strip(), cpf=c.cpf or "").model_dump()
                await db.fiado_customers.update_one(
                    {"phone_digits": phone_digits},
                    {"$setOnInsert": {**customer, "phone_digits": phone_digits}},
                    upsert=True,
                )
    except DuplicateKeyError:
        pass  # Another request registered this customer concurrently.
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Delivery order created but customer registration failed")
    return o


@router.get("/delivery/{id}", response_model=PublicOrderStatus)
async def public_delivery_status(id: str):
    o = await db.orders.find_one({"id": id, "channel": "delivery"}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    return o
