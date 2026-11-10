import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import cancel_authorizer, current_user, require
from lib.db import db
from lib.orders import (MARKET_FEES, build_items, create_ticket, current_cash, emit_invoice, finalize_payment,
                        fiado_reverse, free_table, method_totals, move_stock, new_order, now, pay_key, refresh_totals)
from models.schemas import (CancelIn, CashCloseIn, CashMovement, CashMoveIn, CashOpenIn, CashSession,
                            DeliveryStatusIn, EmitInvoiceIn, Invoice, KitchenTicket, Order, OrderItem,
                            OrderItemIn, QuickSaleIn, SaleResult, SimulateIn, TicketStatusIn)

router = APIRouter()


# ---------- PDV ----------
@router.post("/pdv/sale", response_model=SaleResult)
async def quick_sale(body: QuickSaleIn, user: dict = Depends(require("caixa"))):
    """Atomic create+pay for counter sales. Idempotent on client_ref (offline queue replays)."""
    existing = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0})
    if existing:
        # A reference is an idempotency key, never authorization to another
        # cashier's receipt/customer information.
        if existing.get("waiter_id") and existing["waiter_id"] != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "Venda registrada por outro operador. Solicite revisão do administrador.")
        if existing.get("status") != "pago":
            raise HTTPException(409, "Venda ainda em processamento. Tente sincronizar novamente.")
        inv = await db.invoices.find_one({"id": existing.get("invoice_id")}, {"_id": 0}) if existing.get("invoice_id") else None
        return {"order": existing, "invoice": inv}
    if not await current_cash():
        raise HTTPException(400, "Caixa fechado. Abra o caixa para receber pagamentos.")
    items = await build_items(body.items)
    try:
        order = await new_order(channel="balcao", source="pdv", items=[i.model_dump() for i in items],
                                client_ref=body.client_ref, customer={"name": body.customer_name, "cpf": body.customer_cpf},
                                waiter_id=user["id"], waiter_name=user["name"],
                                audit_events=[{"action": "counter_sale_created", "at": now(),
                                               "actor_id": user["id"], "actor_name": user["name"],
                                               "client_ref": body.client_ref}])
    except DuplicateKeyError:
        # Another device/tab is processing this client_ref. Do not return an unpaid
        # order as a completed sale; the client should retry after the first finishes.
        raise HTTPException(409, "Venda em processamento. Tente sincronizar novamente.") from None
    inv = None
    try:
        order, inv = await finalize_payment(order, body)
    except HTTPException:
        await db.orders.delete_one({"id": order["id"]})
        raise
    if body.send_to_kitchen:
        await create_ticket(order, items)
    await move_stock(items, user["name"], f"PDV · Pedido #{order['number']}")
    return {"order": order, "invoice": inv}


@router.get("/orders", response_model=list[Order])
async def list_orders(status: Optional[str] = None, channel: Optional[str] = None, limit: int = 100,
                      _: dict = Depends(require("caixa"))):
    q: dict = {}
    if status:
        q["status"] = status
    if channel:
        q["channel"] = channel
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))


@router.post("/orders/{id}/cancel", response_model=Order)
async def cancel_order(id: str, body: CancelIn, user: dict = Depends(current_user)):
    o = await db.orders.find_one({"id": id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if o["status"] == "cancelado":
        raise HTTPException(400, "Pedido já cancelado")
    auth = await cancel_authorizer(user, body.manager_pin)
    who = user["name"] if auth == user["name"] else f"{user['name']} (autorizado por {auth})"
    await db.orders.update_one({"id": id}, {"$set": {"status": "cancelado", "cancel_reason": body.reason,
                                                     "cancelled_by": who, "cancelled_at": now()}})
    if o["status"] == "pago":
        fiado = sum(p["amount"] for p in o.get("payments", []) if p["method"] == "fiado") - \
            sum(r["amount"] for r in o.get("refunds", []) if r["method"] == "fiado")
        await fiado_reverse(o, fiado, who, f"Estorno do pedido #{o['number']}")
    await move_stock([OrderItem(**i) for i in o["items"] if not i.get("cancelled")], user["name"], f"Cancelamento #{o['number']}", sign=1)
    if o.get("invoice_id"):
        await db.invoices.update_one({"id": o["invoice_id"]}, {"$set": {"status": "cancelada"}})
    if o.get("table_id") and o["status"] == "aberto":
        await free_table(o["table_id"])
    await db.kitchen_tickets.update_many({"order_id": id}, {"$set": {"status": "entregue"}})
    return await db.orders.find_one({"id": id}, {"_id": 0})


@router.post("/orders/{id}/items/{item_id}/refund", response_model=Order)
async def refund_item(id: str, item_id: str, body: CancelIn, user: dict = Depends(current_user)):
    """Cancel one item. Open orders: just removed. Paid orders: partial refund (estorno) recorded on the order."""
    o = await db.orders.find_one({"id": id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if o["status"] == "cancelado":
        raise HTTPException(400, "Pedido já cancelado")
    item = next((i for i in o["items"] if i["id"] == item_id and not i.get("cancelled")), None)
    if not item:
        raise HTTPException(404, "Item não encontrado ou já cancelado")
    auth = await cancel_authorizer(user, body.manager_pin)
    who = user["name"] if auth == user["name"] else f"{user['name']} (autorizado por {auth})"
    await move_stock([OrderItem(**item)], user["name"], f"Cancelamento #{o['number']}: {body.reason}", sign=1)
    set_item = {"items.$.cancelled": True, "items.$.cancel_reason": body.reason}
    if o["status"] == "aberto":
        await db.orders.update_one({"id": id, "items.id": item_id}, {"$set": set_item})
        return await refresh_totals(id)
    live = [i for i in o["items"] if not i.get("cancelled") and i["id"] != item_id]
    old_sub = o["subtotal"] or 1
    new_sub = round(sum(i["qty"] * i["unit_price"] for i in live), 2)
    service = round(o.get("service_fee", 0) * new_sub / old_sub, 2)
    discount = min(o.get("discount", 0), new_sub)
    total = round(new_sub - discount + service + (o.get("delivery_fee", 0) if live else 0), 2)
    amount = round(o["total"] - total, 2)
    pays = sorted(o.get("payments", []), key=lambda p: -p["amount"])
    main = pays[0] if pays else {"method": "dinheiro"}
    refund = {"item_name": f"{item['qty']}x {item['name']}", "amount": amount, "method": main["method"],
              "brand": main.get("brand"), "reason": body.reason, "by_name": who, "at": now()}
    upd = {**set_item, "subtotal": new_sub, "service_fee": service, "discount": discount, "total": total,
           "cmv": round(sum(i["qty"] * i.get("unit_cost", 0) for i in live), 2)}
    if not live:
        upd.update(status="cancelado", cancel_reason=body.reason, cancelled_by=who, cancelled_at=now())
        if o.get("invoice_id"):
            await db.invoices.update_one({"id": o["invoice_id"]}, {"$set": {"status": "cancelada"}})
    await db.orders.update_one({"id": id, "items.id": item_id},
                               {"$set": upd, "$push": {"refunds": refund}, "$inc": {"refunded_total": amount}})
    if main["method"] == "fiado":
        await fiado_reverse(o, amount, who, f"Estorno de {refund['item_name']} (#{o['number']})")
    return await db.orders.find_one({"id": id}, {"_id": 0})


# ---------- invoices (MOCK fiscal) ----------
@router.get("/invoices", response_model=list[Invoice])
async def list_invoices(_: dict = Depends(require("caixa"))):
    return await db.invoices.find({}, {"_id": 0}).sort("emitted_at", -1).to_list(500)


@router.get("/invoices/{id}", response_model=Invoice)
async def get_invoice(id: str, _: dict = Depends(current_user)):
    inv = await db.invoices.find_one({"id": id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Nota não encontrada")
    return inv


@router.post("/orders/{id}/invoice", response_model=Invoice)
async def emit_for_order(id: str, body: EmitInvoiceIn, _: dict = Depends(require("caixa"))):
    o = await db.orders.find_one({"id": id}, {"_id": 0})
    if not o or o["status"] != "pago":
        raise HTTPException(400, "Somente pedidos pagos podem gerar nota")
    if o.get("invoice_id"):
        raise HTTPException(400, "Pedido já possui nota emitida")
    return await emit_invoice(o, body.doc_type, body.customer_cpf)


# ---------- KDS ----------
@router.get("/kds/tickets", response_model=list[KitchenTicket])
async def kds_tickets(_: dict = Depends(current_user)):
    since = now() - timedelta(hours=2)
    q = {"$or": [{"status": {"$in": ["novo", "preparo"]}}, {"status": "pronto", "updated_at": {"$gte": since}}]}
    return await db.kitchen_tickets.find(q, {"_id": 0}).sort("created_at", 1).to_list(300)


KDS_TRANSITIONS = {"novo": "preparo", "preparo": "pronto", "pronto": "entregue"}


def kds_transition_allowed(current: str, target: str) -> bool:
    """Only forward production steps are allowed; retries are idempotent."""
    return current == target or KDS_TRANSITIONS.get(current) == target


@router.patch("/kds/tickets/{id}", response_model=KitchenTicket)
async def kds_update(id: str, body: TicketStatusIn, _: dict = Depends(require("cozinha", "garcom", "caixa"))):
    ticket = await db.kitchen_tickets.find_one({"id": id}, {"_id": 0})
    if not ticket:
        raise HTTPException(404, "Ticket não encontrado")
    previous = ticket["status"]
    if previous == body.status:
        return ticket
    if not kds_transition_allowed(previous, body.status):
        raise HTTPException(409, "Etapa inválida: atualize os pedidos antes de continuar")
    timestamp = now()
    t = await db.kitchen_tickets.find_one_and_update(
        {"id": id, "status": previous},
        {"$set": {"status": body.status, "updated_at": timestamp},
         "$push": {"status_history": {"from": previous, "to": body.status, "at": timestamp}}},
        projection={"_id": 0}, return_document=True)
    if not t:
        raise HTTPException(409, "Pedido atualizado por outro operador. Atualize a cozinha.")
    if body.status == "pronto":
        o = await db.orders.find_one({"id": t["order_id"]}, {"_id": 0, "channel": 1, "delivery_status": 1})
        if o and o["channel"] == "delivery" and o.get("delivery_status") in ("aceito", "preparo"):
            await db.orders.update_one({"id": t["order_id"]}, {"$set": {"delivery_status": "preparo"}})
    return t

# ---------- Delivery ----------
NAMES = ["Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Eduarda Alves", "Felipe Castro", "Gabriela Nunes"]
STREETS = ["Rua Augusta, 1200", "Av. Paulista, 900", "Rua Oscar Freire, 455", "Rua da Consolação, 2100", "Al. Santos, 88"]


@router.get("/delivery/orders", response_model=list[Order])
async def delivery_orders(_: dict = Depends(require("caixa"))):
    since = now() - timedelta(days=1)
    q = {"channel": "delivery", "$or": [{"delivery_status": {"$in": ["pendente", "aceito", "preparo", "saiu"]}},
                                        {"created_at": {"$gte": since}}]}
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/delivery/simulate", response_model=Order)
async def simulate(body: SimulateIn, _: dict = Depends(require("caixa"))):
    """MOCK: simulates an incoming marketplace order (iFood/99Food/Keeta webhooks are not wired)."""
    prods = await db.products.find({"active": True}, {"_id": 0, "id": 1}).to_list(500)
    if not prods:
        raise HTTPException(400, "Cadastre produtos primeiro")
    rng = secrets.SystemRandom()
    picks = rng.sample(prods, k=min(len(prods), rng.randint(1, 3)))
    items = await build_items([OrderItemIn(product_id=p["id"], qty=rng.randint(1, 2)) for p in picks])
    return await create_delivery_order(body.source, items, {
        "name": rng.choice(NAMES), "phone": f"(11) 9{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}",
        "address": rng.choice(STREETS)}, pay_on_delivery=None if body.source != "site" else "pix")


async def create_delivery_order(source: str, items: list[OrderItem], customer: dict, pay_on_delivery: str | None) -> dict:
    sub = round(sum(i.qty * i.unit_price for i in items), 2)
    fee = 7.99 if source != "site" else 5.0
    total = round(sub + fee, 2)
    return await new_order(channel="delivery", source=source, items=[i.model_dump() for i in items], customer=customer,
                           delivery_status="pendente", subtotal=sub, delivery_fee=fee, total=total,
                           marketplace_fee=round(sub * MARKET_FEES.get(source, 0), 2), pay_on_delivery=pay_on_delivery)


FLOW = {"pendente": ["aceito", "recusado"], "aceito": ["preparo", "saiu"], "preparo": ["saiu"], "saiu": ["entregue"]}


@router.patch("/delivery/orders/{id}/status", response_model=Order)
async def delivery_status(id: str, body: DeliveryStatusIn, user: dict = Depends(require("caixa"))):
    o = await db.orders.find_one({"id": id, "channel": "delivery"}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if body.status not in FLOW.get(o.get("delivery_status") or "", []):
        raise HTTPException(400, f"Transição inválida: {o.get('delivery_status')} → {body.status}")
    upd: dict = {"delivery_status": body.status}
    items = [OrderItem(**i) for i in o["items"]]
    if body.status == "aceito":
        await create_ticket(o, items)
        await move_stock(items, user["name"], f"Delivery #{o['number']}")
    elif body.status == "recusado":
        upd["status"] = "cancelado"
    elif body.status == "entregue":
        cash = await current_cash()
        method = o.get("pay_on_delivery") or "online"
        upd.update(status="pago", paid_at=now(), payments=[{"method": method, "amount": o["total"]}],
                   cmv=round(sum(i.qty * i.unit_cost for i in items), 2),
                   cash_session_id=cash["id"] if cash else None)
    await db.orders.update_one({"id": id}, {"$set": upd})
    return await db.orders.find_one({"id": id}, {"_id": 0})


# ---------- Cash register ----------
async def cash_summary(s: dict) -> dict:
    orders = await db.orders.find({"cash_session_id": s["id"], "status": "pago"},
                                  {"_id": 0, "payments": 1, "change": 1, "total": 1, "refunds": 1}).to_list(10000)
    totals = method_totals(orders, with_brand=True)
    async for r in db.customer_moves.find({"cash_session_id": s["id"], "type": "pagamento"}, {"_id": 0}):
        k = pay_key(r)
        totals[k] = round(totals.get(k, 0) + r["amount"], 2)
    sup = sum(m["amount"] for m in s.get("movements", []) if m["type"] == "suprimento")
    san = sum(m["amount"] for m in s.get("movements", []) if m["type"] == "sangria")
    s["totals_by_method"] = totals
    s["sales_count"] = len(orders)
    s["sales_total"] = round(sum(o["total"] for o in orders), 2)
    s["expected_cash"] = round(s["opening_amount"] + totals.get("dinheiro", 0) + sup - san, 2)
    if s.get("counted_amount") is not None:
        s["difference"] = round(s["counted_amount"] - s["expected_cash"], 2)
    return s


@router.get("/cash/current", response_model=CashSession | None)
async def cash_current(_: dict = Depends(require("caixa"))):
    s = await current_cash()
    return await cash_summary(s) if s else None


@router.get("/cash/history", response_model=list[CashSession])
async def cash_history(_: dict = Depends(require("caixa"))):
    return await db.cash_sessions.find({"status": "fechado"}, {"_id": 0}).sort("closed_at", -1).to_list(60)


@router.post("/cash/open", response_model=CashSession)
async def cash_open(body: CashOpenIn, user: dict = Depends(require("caixa"))):
    if await current_cash():
        raise HTTPException(400, "Já existe um caixa aberto")
    s = CashSession(opened_by_name=user["name"], opening_amount=body.opening_amount).model_dump()
    try:
        await db.cash_sessions.insert_one(dict(s))
    except DuplicateKeyError:
        raise HTTPException(409, "Já existe um caixa aberto") from None
    return s


@router.post("/cash/movement", response_model=CashSession)
async def cash_move(body: CashMoveIn, user: dict = Depends(require("caixa"))):
    s = await current_cash()
    if not s:
        raise HTTPException(400, "Nenhum caixa aberto")
    if body.type == "sangria" and len(body.note.strip()) < 3:
        raise HTTPException(400, "Informe o motivo da sangria (mínimo de 3 caracteres)")
    if body.type == "sangria" and body.amount > (await cash_summary(dict(s)))["expected_cash"]:
        raise HTTPException(400, "Sangria maior que o saldo em dinheiro")
    m = CashMovement(type=body.type, amount=body.amount, note=body.note, by_name=user["name"]).model_dump()
    result = await db.cash_sessions.update_one({"id": s["id"], "status": "aberto"}, {"$push": {"movements": m}})
    if not result.modified_count:
        raise HTTPException(409, "O caixa foi fechado durante a operação")
    return await cash_summary(await db.cash_sessions.find_one({"id": s["id"]}, {"_id": 0}))


@router.post("/cash/close", response_model=CashSession)
async def cash_close(body: CashCloseIn, user: dict = Depends(require("caixa"))):
    s = await current_cash()
    if not s:
        raise HTTPException(400, "Nenhum caixa aberto")
    s["counted_amount"] = body.counted_amount
    s = await cash_summary(s)
    upd = {k: s[k] for k in ("totals_by_method", "sales_count", "sales_total", "expected_cash", "difference", "counted_amount")}
    upd.update(status="fechado", closed_at=now(), closed_by_name=user["name"])
    result = await db.cash_sessions.update_one({"id": s["id"], "status": "aberto"}, {"$set": upd})
    if not result.modified_count:
        raise HTTPException(409, "O caixa já foi fechado por outro operador")
    return await db.cash_sessions.find_one({"id": s["id"]}, {"_id": 0})
