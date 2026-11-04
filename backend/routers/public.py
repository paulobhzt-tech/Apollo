"""Unauthenticated endpoints used by the QR-code table menu and the own delivery site."""
import os

from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.orders import build_items, create_ticket, move_stock, refresh_totals
from routers.catalog import products_with_cost
from routers.operations import create_delivery_order
from routers.tables import get_or_open_order, get_table
from models.schemas import CallIn, OkOut, PublicDeliveryIn, PublicMenu, PublicOrderIn, PublicOrderStatus, PublicTable

router = APIRouter(prefix="/public")
RESTAURANT = os.environ.get("RESTAURANT_NAME", "Brasa & Forno")


@router.get("/menu", response_model=PublicMenu)
async def menu():
    cats = await db.categories.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(500)
    prods = await products_with_cost({"active": True})
    for p in prods:  # never expose cost data publicly
        p["cost"], p["margin_pct"], p["recipe"] = 0, 0, []
    return {"restaurant": RESTAURANT, "categories": cats, "products": prods}


@router.get("/tables/{id}", response_model=PublicTable)
async def public_table(id: str):
    t = await get_table(id)
    return {"id": t["id"], "number": t["number"], "status": t["status"], "total": t.get("total", 0)}


@router.post("/tables/{id}/order", response_model=PublicTable)
async def public_table_order(id: str, body: PublicOrderIn):
    t = await get_table(id)
    if t["status"] == "reservada":
        raise HTTPException(400, "Mesa reservada. Chame um garçom.")
    items = await build_items(body.items)
    order = await get_or_open_order(t, None, source="cardapio")
    await db.orders.update_one({"id": order["id"]}, {"$push": {"items": {"$each": [i.model_dump() for i in items]}}})
    await create_ticket(order, items)
    await move_stock(items, "Cardápio QR", f"Mesa {t['number']} · QR")
    o = await refresh_totals(order["id"])
    return {"id": t["id"], "number": t["number"], "status": "ocupada", "total": o["total"]}


@router.post("/tables/{id}/call", response_model=OkOut)
async def public_call(id: str, body: CallIn):
    await get_table(id)
    await db.tables.update_one({"id": id}, {"$set": {"call": body.type}})
    return OkOut(message="Garçom chamado" if body.type == "garcom" else "Conta solicitada")


@router.post("/delivery", response_model=PublicOrderStatus)
async def public_delivery(body: PublicDeliveryIn):
    c = body.customer
    if len(c.name.strip()) < 2 or len(c.phone.strip()) < 8 or len(c.address.strip()) < 5:
        raise HTTPException(400, "Informe nome, telefone e endereço completos")
    items = await build_items(body.items)
    o = await create_delivery_order("site", items, c.model_dump(), pay_on_delivery=body.payment_method)
    return o


@router.get("/delivery/{id}", response_model=PublicOrderStatus)
async def public_delivery_status(id: str):
    o = await db.orders.find_one({"id": id, "channel": "delivery"}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    return o
