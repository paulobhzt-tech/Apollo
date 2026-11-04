"""Order domain helpers shared by PDV, tables, delivery and public routers."""
import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.schemas import Invoice, InvoiceItem, KitchenItem, KitchenTicket, OrderItem, OrderItemIn, PayIn, StockMove

TZ = ZoneInfo("America/Sao_Paulo")
MARKET_FEES = {"ifood": 0.23, "99food": 0.15, "keeta": 0.12, "site": 0.0}
TAX_RATE = 0.06  # Simples Nacional (simulado)
SOURCE_LABEL = {"ifood": "iFood", "99food": "99Food", "keeta": "Keeta", "site": "Site Próprio",
                "pdv": "Balcão", "mesa": "Mesa", "cardapio": "QR Mesa"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def day_bounds(date_str: str) -> tuple[datetime, datetime]:
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=TZ)
    return d.astimezone(timezone.utc), (d + timedelta(days=1)).astimezone(timezone.utc)


def local_today() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(doc["seq"])


def recipe_cost(recipe: list[dict], ings: dict[str, dict]) -> float:
    return round(sum(ings[r["ingredient_id"]]["cost_per_unit"] * r["qty"] for r in recipe if r["ingredient_id"] in ings), 2)


async def ingredient_map() -> dict[str, dict]:
    return {i["id"]: i for i in await db.ingredients.find({}, {"_id": 0}).to_list(5000)}


async def build_items(items_in: list[OrderItemIn]) -> list[OrderItem]:
    ids = list({i.product_id for i in items_in})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}, "active": True}, {"_id": 0}).to_list(500)}
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    ings = await ingredient_map()
    out: list[OrderItem] = []
    for it in items_in:
        p = prods.get(it.product_id)
        if not p:
            raise HTTPException(400, "Produto indisponível ou inexistente")
        out.append(OrderItem(
            product_id=p["id"], name=p["name"], qty=it.qty, unit_price=p["price"],
            unit_cost=recipe_cost(p.get("recipe", []), ings), notes=it.notes,
            station=cats.get(p["category_id"], {}).get("station", "cozinha"),
        ))
    return out


async def move_stock(items: list[OrderItem], by_name: str, note: str, sign: int = -1) -> None:
    """sign=-1 consumes ingredients (sale), +1 returns them (cancel)."""
    ids = list({i.product_id for i in items})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "recipe": 1}).to_list(500)}
    agg: dict[str, float] = {}
    for it in items:
        for r in prods.get(it.product_id, {}).get("recipe", []):
            agg[r["ingredient_id"]] = agg.get(r["ingredient_id"], 0) + r["qty"] * it.qty
    if not agg:
        return
    ings = await ingredient_map()
    moves = []
    for ing_id, q in agg.items():
        if ing_id not in ings:
            continue
        await db.ingredients.update_one({"id": ing_id}, {"$inc": {"stock": round(sign * q, 4)}, "$set": {"updated_at": now()}})
        moves.append(StockMove(ingredient_id=ing_id, ingredient_name=ings[ing_id]["name"],
                               type="venda" if sign < 0 else "estorno", qty=round(sign * q, 4),
                               note=note, by_name=by_name).model_dump())
    if moves:
        await db.stock_moves.insert_many(moves)


def ticket_label(order: dict) -> str:
    if order.get("table_number"):
        return f"Mesa {order['table_number']}"
    if order["source"] == "pdv":
        return f"Balcão #{order['number']}"
    return f"{SOURCE_LABEL.get(order['source'], order['source'])} #{order['number']}"


async def create_ticket(order: dict, items: list[OrderItem]) -> None:
    t = KitchenTicket(
        order_id=order["id"], order_number=order["number"], label=ticket_label(order), source=order["source"],
        items=[KitchenItem(name=i.name, qty=i.qty, notes=i.notes, station=i.station) for i in items],
    )
    await db.kitchen_tickets.insert_one(t.model_dump())


def compute_subtotal(order: dict) -> float:
    return round(sum(i["qty"] * i["unit_price"] for i in order["items"] if not i.get("cancelled")), 2)


async def refresh_totals(order_id: str) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    sub = compute_subtotal(order)
    total = round(sub - order.get("discount", 0) + order.get("service_fee", 0) + order.get("delivery_fee", 0), 2)
    await db.orders.update_one({"id": order_id}, {"$set": {"subtotal": sub, "total": total}})
    if order.get("table_id"):
        await db.tables.update_one({"id": order["table_id"]}, {"$set": {"total": total}})
    order.update(subtotal=sub, total=total)
    return order


async def current_cash() -> dict | None:
    return await db.cash_sessions.find_one({"status": "aberto"}, {"_id": 0})


async def emit_invoice(order: dict, doc_type: str = "nfce", cpf: str = "") -> dict:
    """MOCK: generates a fake SEFAZ-authorised NFC-e/NF-e. No real fiscal transmission."""
    number = await next_seq(f"invoice_{doc_type}")
    model = "65" if doc_type == "nfce" else "55"
    dt = now()
    key = f"35{dt:%y%m}12345678000190{model}001{number:09d}1{random.randint(10**7, 10**8 - 1)}"
    key += str(sum(int(c) for c in key) % 10)
    inv = Invoice(
        number=number, doc_type=doc_type, access_key=key, protocol=f"135{random.randint(10**11, 10**12 - 1)}",
        order_id=order["id"], order_number=order["number"], total=order["total"],
        items=[InvoiceItem(name=i["name"], qty=i["qty"], unit_price=i["unit_price"]) for i in order["items"] if not i.get("cancelled")],
        payments=order.get("payments", []), customer_cpf=cpf,
    ).model_dump()
    await db.invoices.insert_one(dict(inv))
    await db.orders.update_one({"id": order["id"]}, {"$set": {"invoice_id": inv["id"]}})
    return inv


async def finalize_payment(order: dict, pay: PayIn) -> tuple[dict, dict | None]:
    if order["status"] != "aberto":
        raise HTTPException(400, "Este pedido já foi fechado")
    cash = await current_cash()
    if not cash:
        raise HTTPException(400, "Caixa fechado. Abra o caixa para receber pagamentos.")
    sub = compute_subtotal(order)
    if sub <= 0:
        raise HTTPException(400, "Pedido sem itens")
    if pay.discount > sub:
        raise HTTPException(400, "Desconto maior que o subtotal")
    service = round(sub * pay.service_pct / 100, 2)
    total = round(sub - pay.discount + service + order.get("delivery_fee", 0), 2)
    paid = round(sum(p.amount for p in pay.payments), 2)
    if paid + 0.009 < total:
        raise HTTPException(400, f"Valor pago insuficiente (faltam R$ {total - paid:.2f})")
    change = round(paid - total, 2)
    cash_paid = sum(p.amount for p in pay.payments if p.method == "dinheiro")
    if change > cash_paid + 0.009:
        raise HTTPException(400, "Troco só pode ser dado em dinheiro")
    cmv = round(sum(i["qty"] * i.get("unit_cost", 0) for i in order["items"] if not i.get("cancelled")), 2)
    upd = {
        "status": "pago", "subtotal": sub, "discount": pay.discount, "service_fee": service, "total": total,
        "payments": [p.model_dump() for p in pay.payments], "change": change, "paid_at": now(),
        "cash_session_id": cash["id"], "cmv": cmv,
    }
    if pay.customer_cpf:
        upd["customer.cpf"] = pay.customer_cpf
    await db.orders.update_one({"id": order["id"]}, {"$set": upd})
    if order.get("table_id"):
        await free_table(order["table_id"])
    order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    inv = await emit_invoice(order, pay.doc_type, pay.customer_cpf) if pay.emit_invoice else None
    if inv:
        order["invoice_id"] = inv["id"]
    return order, inv


async def free_table(table_id: str) -> None:
    await db.tables.update_one({"id": table_id}, {"$set": {
        "status": "livre", "customer_name": "", "people": 0, "waiter_id": None, "waiter_name": "",
        "order_id": None, "opened_at": None, "call": "", "total": 0,
    }})


async def new_order(**fields) -> dict:
    from models.schemas import Order
    order = Order(number=await next_seq("order"), **fields).model_dump()
    await db.orders.insert_one(dict(order))
    return order
