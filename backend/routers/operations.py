import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from lib.demo_guard import delivery_simulation_enabled
from lib.counter_sale_gate import counter_sale_gate
from lib.audit_alerts import summarize_audit_alerts
from lib.audit import audit_event, verify_event
from lib.cash_scope import cash_scope, independent_cash, claim_cash, prepare_cash_mode
from lib.auth import cancel_authorizer, current_user, require
from lib.sync_identity import validate_sync_context
from lib.db import db
from lib.orders import (MARKET_FEES, build_items, create_ticket, current_cash, day_bounds, emit_invoice, finalize_payment, order_for_operator,
                        fiado_reverse, free_table, method_totals, move_stock, new_order, now, pay_key, refresh_totals)
from models.schemas import (CancelIn, CashCloseIn, CashMovement, CashMoveIn, CashOpenIn, CashSession,
                            DeliveryStatusIn, EmitInvoiceIn, Invoice, KitchenTicket, Order, OrderItem,
                            OrderItemIn, QuickSaleIn, SaleResult, SimulateIn, TicketStatusIn)

router = APIRouter()


# ---------- PDV ----------
def sale_fingerprint(body: QuickSaleIn) -> str:
    """Bind the idempotency reference to the validated request, without storing PII twice."""
    payload = body.model_dump(mode="json", exclude={"client_ref", "sync_context"})
    if payload.get("expected_cash_session_id") is None:
        payload.pop("expected_cash_session_id", None)
    # Preserve the reference fingerprint for queues created before payment details existed.
    if not payload["discount_reason"]:
        payload.pop("discount_reason")
    for payment in payload["payments"]:
        if payment["details"] is None:
            payment.pop("details")
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


@router.post("/pdv/sale", response_model=SaleResult)
async def quick_sale(body: QuickSaleIn, user: dict = Depends(require("caixa"))):
    """Atomic create+pay for counter sales. Idempotent on client_ref (offline queue replays)."""
    await validate_sync_context(body.sync_context, user)
    async with counter_sale_gate(user["id"]):
        return await apply_quick_sale(body, user)


async def apply_quick_sale(body: QuickSaleIn, user: dict):
    existing = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0})
    if existing:
        return await counter_sale_replay(existing, body, user)
    try:
        return await with_order_transaction(lambda session: record_counter_sale(body, user, session=session))
    except DuplicateKeyError:
        # The competing transaction may have committed after our initial lookup.
        # Return only its fully settled result, with the same ownership/fingerprint checks.
        existing = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0})
        if existing:
            return await counter_sale_replay(existing, body, user)
        raise HTTPException(409, "Venda em processamento. Tente sincronizar novamente.") from None


async def counter_sale_replay(existing: dict, body: QuickSaleIn, user: dict):
    # A reference is an idempotency key, never authorization to another
    # cashier's receipt/customer information.
    if existing.get("waiter_id") and existing["waiter_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Venda registrada por outro operador. Solicite revisão do administrador.")
    if existing.get("request_fingerprint") and existing["request_fingerprint"] != sale_fingerprint(body):
        raise HTTPException(422, "Referência de venda reutilizada com dados diferentes. Solicite revisão do administrador.")
    if existing.get("status") != "pago":
        raise HTTPException(409, "Venda ainda em processamento. Tente sincronizar novamente.")
    if existing.get("stock_completion") == "pending":
        raise HTTPException(409, "Pagamento já registrado. Baixa pendente de conferência administrativa. Não cobre novamente.")
    inv = await db.invoices.find_one({"id": existing.get("invoice_id")}, {"_id": 0}) if existing.get("invoice_id") else None
    return {"order": existing, "invoice": inv}


async def with_order_transaction(operation):
    topology = await db.command("hello")
    if topology.get("setName") or topology.get("msg") == "isdbgrid":
        async with await db.client.start_session() as session:
            return await session.with_transaction(operation)
    return await operation(None)


async def record_counter_sale(body: QuickSaleIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    cash = await current_cash(**cash_scope(user), **options)
    if not cash:
        raise HTTPException(400, "Caixa fechado. Abra o caixa para receber pagamentos.")
    if body.expected_cash_session_id is not None and body.expected_cash_session_id != cash["id"]:
        raise HTTPException(409, "O turno original da venda mudou. Confira a fila; nenhuma cobrança registrada.")
    if independent_cash() and body.sync_context is not None and body.expected_cash_session_id is None:
        raise HTTPException(422, "Fila antiga sem identificação de turno. Solicite revisão administrativa antes de receber.")
    items = await build_items(body.items, channel="caixa")
    order = await new_order(channel="balcao", source="pdv", items=[i.model_dump() for i in items],
                            client_ref=body.client_ref, request_fingerprint=sale_fingerprint(body),
                            customer={"name": body.customer_name, "cpf": body.customer_cpf},
                            waiter_id=user["id"], waiter_name=user["name"], stock_completion="pending",
                            audit_events=[audit_event("counter_sale_created", user, correlation=body.client_ref)],
                            **options)
    try:
        order, invoice = await finalize_payment(order, body, actor=user, **options)
    except HTTPException:
        if session is None:
            await db.orders.delete_one({"id": order["id"], "status": "aberto"})
        raise
    try:
        if body.send_to_kitchen:
            await create_ticket(order, items, **options)
        await move_stock(items, user["name"], f"PDV · Pedido #{order['number']}", **options)
        await db.orders.update_one({"id": order["id"]}, {"$set": {"stock_completion": "complete"}}, **options)
    except Exception as error:
        if session is not None:
            raise
        raise HTTPException(409, "Pagamento registrado com baixa pendente. Solicite conferência e não cobre novamente.") from error
    order["stock_completion"] = "complete"
    return {"order": order, "invoice": invoice}


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
    auth = await cancel_authorizer(user, body.manager_pin)
    order = await with_order_transaction(lambda session: apply_cancel_order(id, body, user, auth, session=session))
    return order_for_operator(order, user)


async def guard_refund_cash(order: dict, user: dict, *, session=None):
    if not independent_cash() or order.get("status") != "pago":
        return None
    options = {"session": session} if session is not None else {}
    original = await db.cash_sessions.find_one({"id": order.get("cash_session_id")}, {"_id": 0}, **options)
    if not original:
        raise HTTPException(409, "Caixa original não encontrado. Solicite conferência administrativa.")
    if original.get("status") == "aberto":
        await claim_cash(original, session=session)
        return None
    cash = await current_cash(**cash_scope(user), **options)
    if not cash:
        raise HTTPException(409, "Abra seu caixa para registrar a devolução de um turno anterior.")
    await claim_cash(cash, session=session)
    return cash["id"]


async def record_refund_adjustment(order, cash_id, amounts, key, user, reason, *, session=None):
    if cash_id is None:
        return
    if session is None:
        raise HTTPException(503, "Devolução entre turnos exige transação.")
    await db.cash_adjustments.insert_one({
        "_id": order["id"] + ":" + key, "id": order["id"] + ":" + key, "cash_session_id": cash_id,
        "source_cash_session_id": order["cash_session_id"], "order_id": order["id"],
        "operator_id": user["id"], "by_name": user["name"], "at": now(), "reason": reason,
        "totals_by_method": {method: -round(amount, 2) for method, amount in amounts.items()},
        "audit_events": [audit_event("closed_shift_refund", user, reason=reason, correlation=order["id"] + ":" + key, values={"amount": -round(sum(amounts.values()), 2)})],
    }, session=session)


async def apply_cancel_order(id: str, body: CancelIn, user: dict, auth: str, *, session=None):
    options = {"session": session} if session is not None else {}
    o = await db.orders.find_one({"id": id}, {"_id": 0}, **options)
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if o["status"] == "cancelado":
        raise HTTPException(400, "Pedido já cancelado")
    if o.get("stock_completion") == "pending":
        raise HTTPException(409, "Confira a baixa pendente deste pedido antes de estornar.")
    refund_cash_id = await guard_refund_cash(o, user, session=session)
    who = user["name"] if auth == user["name"] else f"{user['name']} (autorizado por {auth})"
    result = await db.orders.update_one({"id": id, "status": o["status"], "items": o.get("items", []), "stock_completion": {"$ne": "pending"},
                                         "delivery_status": o.get("delivery_status")},
        {"$set": {"status": "cancelado", "cancellation_kind": "full", "cancel_reason": body.reason, "cancelled_by": who, "cancelled_at": now()},
         "$push": {"audit_events": audit_event("order_cancelled", user, reason=body.reason, authorized_by=auth,
                                               values={"from": o["status"], "to": "cancelado", "total": o.get("total", 0)})}}, **options)
    if not result.modified_count:
        raise HTTPException(409, "Pedido alterado por outro operador. Atualize antes de cancelar.")
    if o["status"] == "pago":
        await record_refund_adjustment(o, refund_cash_id, method_totals([o], with_brand=True), "cancel", user, body.reason, session=session)
        fiado = sum(p["amount"] for p in o.get("payments", []) if p["method"] == "fiado") - \
            sum(r["amount"] for r in o.get("refunds", []) if r["method"] == "fiado")
        await fiado_reverse(o, fiado, who, f"Estorno do pedido #{o['number']}", **options)
    if o.get("channel") != "delivery" or o.get("delivery_status") != "pendente":
        await move_stock([OrderItem(**i) for i in o["items"] if not i.get("cancelled")], user["name"], f"Cancelamento #{o['number']}", sign=1, historical_order_id=o.get("parent_order_id") or id, **options)
    if o.get("invoice_id"):
        await db.invoices.update_one({"id": o["invoice_id"]}, {"$set": {"status": "cancelada"}}, **options)
    if o.get("table_id") and o["status"] == "aberto":
        await free_table(o["table_id"], expected_order_id=o["id"], **options)
    await db.kitchen_tickets.update_many({"order_id": id}, {"$set": {"status": "entregue"}}, **options)
    return await db.orders.find_one({"id": id}, {"_id": 0}, **options)


@router.post("/orders/{id}/items/{item_id}/refund", response_model=Order)
async def refund_item(id: str, item_id: str, body: CancelIn, user: dict = Depends(current_user)):
    """Cancel one item. Open orders: just removed. Paid orders: partial refund (estorno) recorded on the order."""
    auth = await cancel_authorizer(user, body.manager_pin)
    order = await with_order_transaction(lambda session: apply_refund_item(id, item_id, body, user, auth, session=session))
    return order_for_operator(order, user)


async def apply_refund_item(id: str, item_id: str, body: CancelIn, user: dict, auth: str, *, session=None):
    options = {"session": session} if session is not None else {}
    o = await db.orders.find_one({"id": id}, {"_id": 0}, **options)
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if o["status"] == "cancelado":
        raise HTTPException(400, "Pedido já cancelado")
    if o.get("stock_completion") == "pending":
        raise HTTPException(409, "Confira a baixa pendente deste pedido antes de estornar.")
    item = next((i for i in o["items"] if i["id"] == item_id and not i.get("cancelled")), None)
    if not item:
        raise HTTPException(404, "Item não encontrado ou já cancelado")
    refund_cash_id = await guard_refund_cash(o, user, session=session)
    who = user["name"] if auth == user["name"] else f"{user['name']} (autorizado por {auth})"
    event = audit_event("item_refunded" if o["status"] == "pago" else "item_cancelled", user,
                        reason=body.reason, authorized_by=auth,
                        values={"item_id": item_id, "qty": item["qty"], "from": o["status"]})
    # Compare the item snapshot as well as status so simultaneous refunds of
    # different items cannot overwrite the totals computed below.
    criteria = {"id": id, "status": o["status"], "items": o["items"],
                "stock_completion": {"$ne": "pending"}, "delivery_status": o.get("delivery_status")}
    set_item = {"items": [
        {**entry, "cancelled": True, "cancel_reason": body.reason}
        if entry["id"] == item_id else entry for entry in o["items"]
    ]}
    if o["status"] == "aberto":
        result = await db.orders.update_one(criteria, {"$set": set_item, "$push": {"audit_events": event}}, **options)
        if not result.modified_count:
            raise HTTPException(409, "O pedido mudou. Atualize antes de cancelar o item.")
        if o.get("channel") != "delivery" or o.get("delivery_status") != "pendente":
            await move_stock([OrderItem(**item)], user["name"], f"Cancelamento #{o['number']}: {body.reason}", sign=1, historical_order_id=o.get("parent_order_id") or id, **options)
        return await refresh_totals(id, **options)
    live = [i for i in o["items"] if not i.get("cancelled") and i["id"] != item_id]
    old_sub = o["subtotal"] or 1
    new_sub = round(sum(i["qty"] * i["unit_price"] for i in live), 2)
    if o.get("parent_order_id"):
        # A receipt may include a cent allocated to the balance left on the
        # table. Removing an item cannot increase the amount still payable.
        new_sub = min(new_sub, o["subtotal"])
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
        upd.update(status="cancelado", cancellation_kind="last_item", cancel_reason=body.reason, cancelled_by=who, cancelled_at=now())
    result = await db.orders.update_one(criteria,
        {"$set": upd, "$push": {"refunds": refund, "audit_events": event}, "$inc": {"refunded_total": amount}}, **options)
    if not result.modified_count:
        raise HTTPException(409, "O pedido mudou. Atualize antes de estornar o item.")
    await record_refund_adjustment(o, refund_cash_id, {pay_key(main): amount}, "item:" + item_id, user, body.reason, session=session)
    await move_stock([OrderItem(**item)], user["name"], f"Estorno #{o['number']}: {body.reason}", sign=1, historical_order_id=o.get("parent_order_id") or id, **options)
    if not live and o.get("invoice_id"):
        await db.invoices.update_one({"id": o["invoice_id"]}, {"$set": {"status": "cancelada"}}, **options)
    if main["method"] == "fiado":
        await fiado_reverse(o, amount, who, f"Estorno de {refund['item_name']} (#{o['number']})", **options)
    return await db.orders.find_one({"id": id}, {"_id": 0}, **options)


# ---------- invoices (MOCK fiscal) ----------
@router.get("/invoices", response_model=list[Invoice])
async def list_invoices(_: dict = Depends(require("caixa"))):
    return await db.invoices.find({}, {"_id": 0}).sort("emitted_at", -1).to_list(500)


@router.get("/invoices/{id}", response_model=Invoice)
async def get_invoice(id: str, _: dict = Depends(require("caixa"))):
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
async def kds_tickets(_: dict = Depends(current_user), delivered: bool = False):
    if delivered:
        return await db.kitchen_tickets.find({"status": "entregue"}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    since = now() - timedelta(hours=2)
    q = {"$or": [{"status": {"$in": ["novo", "preparo"]}}, {"status": "pronto", "updated_at": {"$gte": since}}]}
    return await db.kitchen_tickets.find(q, {"_id": 0}).sort("created_at", 1).to_list(300)


KDS_TRANSITIONS = {"novo": "preparo", "preparo": "pronto", "pronto": "entregue"}


def kds_transition_allowed(current: str, target: str) -> bool:
    """Only forward production steps are allowed; retries are idempotent."""
    return current == target or KDS_TRANSITIONS.get(current) == target


@router.patch("/kds/tickets/{id}", response_model=KitchenTicket)
async def kds_update(id: str, body: TicketStatusIn, user: dict = Depends(require("cozinha", "garcom", "caixa"))):
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
         "$push": {"status_history": {"from": previous, "to": body.status, "at": timestamp},
                   "audit_events": audit_event("kds_status_changed", user, values={"from": previous, "to": body.status})}},
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
    """Simulate an incoming order only in explicitly configured test databases."""
    if not delivery_simulation_enabled():
        raise HTTPException(403, "A simulação está disponível apenas em ambiente de teste")
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
    return await with_order_transaction(lambda session: apply_delivery_status(id, body, user, session=session))


async def apply_delivery_status(id: str, body: DeliveryStatusIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    o = await db.orders.find_one({"id": id, "channel": "delivery"}, {"_id": 0}, **options)
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    if o.get("stock_completion") == "pending":
        raise HTTPException(409, "Aceite com baixa pendente. Solicite conferência antes de avançar.")
    previous = o.get("delivery_status")
    if body.status == previous:
        return o
    if o["status"] != "aberto" or body.status not in FLOW.get(previous or "", []):
        raise HTTPException(400, f"Transição inválida: {previous} → {body.status}")
    upd: dict = {"delivery_status": body.status}
    items = [OrderItem(**i) for i in o["items"] if not i.get("cancelled")]
    if body.status == "aceito":
        upd["stock_completion"] = "pending"
    elif body.status == "recusado":
        upd["status"] = "cancelado"
    elif body.status == "entregue":
        cash = await current_cash(**cash_scope(user), **options)
        if not cash:
            raise HTTPException(400, "Abra o caixa do operador para receber a entrega.")
        await claim_cash(cash, session=session)
        method = o.get("pay_on_delivery") or "online"
        upd.update(status="pago", paid_at=now(), payments=[{"method": method, "amount": o["total"]}],
                   cmv=round(sum(i.qty * i.unit_cost for i in items), 2),
                   cash_session_id=cash["id"] if cash else None)
    result = await db.orders.update_one(
        {"id": id, "delivery_status": previous, "status": "aberto", "items": o["items"]},
        {"$set": upd, "$push": {"audit_events": audit_event("delivery_status_changed", user,
          values={"from": previous, "to": body.status})}}, **options,
    )
    if not result.modified_count:
        raise HTTPException(409, "Delivery alterado por outro operador. Atualize antes de reenviar.")
    if body.status == "aceito":
        try:
            await create_ticket(o, items, **options)
            await move_stock(items, user["name"], f"Delivery #{o['number']}", **options)
            await db.orders.update_one({"id": id, "stock_completion": "pending"},
                                       {"$set": {"stock_completion": "complete"}}, **options)
        except Exception as error:
            if session is not None:
                raise
            raise HTTPException(409, "Aceite registrado com baixa pendente. Solicite conferência.") from error
    return await db.orders.find_one({"id": id}, {"_id": 0}, **options)


# ---------- Cash register ----------
async def cash_summary(s: dict, *, session=None) -> dict:
    if independent_cash() and s.get("status") == "fechado" and s.get("counted_amount") is not None:
        return s
    options = {"session": session} if session is not None else {}
    orders = await db.orders.find({"cash_session_id": s["id"], "$or": [
        {"status": "pago"},
        {"status": "cancelado", "total": 0, "refunds.0": {"$exists": True},
         "cancellation_kind": {"$ne": "full"}},
    ]}, {"_id": 0, "status": 1, "payments": 1, "change": 1, "total": 1, "refunds": 1}, **options).to_list(None)
    totals = method_totals(orders, with_brand=True)
    receipts = {}
    async for receipt in db.customer_moves.find({"cash_session_id": s["id"], "type": "pagamento"}, {"_id": 0}, **options):
        receipts[receipt["id"]] = receipt
    async for receipt in db.fiado_customers.aggregate([
        {"$match": {"fiado_journal": {"$type": "object"}}},
        {"$project": {"entries": {"$objectToArray": "$fiado_journal"}}},
        {"$unwind": "$entries"},
        {"$match": {"entries.v.move.cash_session_id": s["id"], "entries.v.move.type": "pagamento"}},
        {"$replaceRoot": {"newRoot": "$entries.v.move"}},
    ], **options):
        receipts[receipt["id"]] = receipt
    for receipt in receipts.values():
        key = pay_key(receipt)
        totals[key] = round(totals.get(key, 0) + receipt["amount"], 2)
    adjustments = []
    if independent_cash():
        async for adjustment in db.cash_adjustments.find({"cash_session_id": s["id"]}, {"_id": 0}, **options):
            adjustments.append(adjustment)
            for method, amount in adjustment["totals_by_method"].items():
                totals[method] = round(totals.get(method, 0) + amount, 2)
    s["refund_adjustments"] = adjustments
    sup = sum(m["amount"] for m in s.get("movements", []) if m["type"] == "suprimento")
    san = sum(m["amount"] for m in s.get("movements", []) if m["type"] == "sangria")
    s["totals_by_method"] = totals
    s["sales_count"] = sum(o.get("status", "pago") == "pago" for o in orders)
    s["sales_total"] = round(sum(o["total"] for o in orders), 2)
    s["expected_cash"] = round(s["opening_amount"] + totals.get("dinheiro", 0) + sup - san, 2)
    if s.get("counted_amount") is not None:
        s["difference"] = round(s["counted_amount"] - s["expected_cash"], 2)
    return s


@router.get("/cash/current", response_model=CashSession | None)
async def cash_current(user: dict = Depends(require("caixa"))):
    s = await current_cash(**cash_scope(user))
    return await cash_summary(s) if s else None


@router.get("/cash/history", response_model=list[CashSession])
async def cash_history(user: dict = Depends(require("caixa")), start: str = "", end: str = ""):
    query = {"status": "fechado"}
    if independent_cash() and user.get("role") != "admin":
        query["opened_by_id"] = user["id"]
    if start or end:
        try:
            lower = day_bounds(start)[0] if start else None
            upper = day_bounds(end)[1] if end else None
            if lower and upper and lower >= upper:
                raise ValueError
        except ValueError:
            raise HTTPException(422, "Intervalo de fechamento inválido") from None
        query["closed_at"] = {}
        if lower is not None:
            query["closed_at"]["$gte"] = lower
        if upper is not None:
            query["closed_at"]["$lt"] = upper
    return await db.cash_sessions.find(query, {"_id": 0}).sort("closed_at", -1).to_list(60)


@router.post("/cash/open", response_model=CashSession)
async def cash_open(body: CashOpenIn, user: dict = Depends(require("caixa"))):
    if independent_cash():
        await prepare_cash_mode()
    if await current_cash(**cash_scope(user)):
        raise HTTPException(400, "Já existe um caixa aberto")
    s = CashSession(opened_by_id=user["id"] if independent_cash() else None, opened_by_name=user["name"], opening_amount=body.opening_amount, opening_note=body.note.strip(),
                    audit_events=[audit_event("cash_opened", user, reason=body.note.strip(), values={"opening_amount": body.opening_amount})]).model_dump()
    try:
        await db.cash_sessions.insert_one(dict(s))
    except DuplicateKeyError:
        raise HTTPException(409, "Já existe um caixa aberto") from None
    return s


@router.post("/cash/movement", response_model=CashSession)
async def cash_move(body: CashMoveIn, user: dict = Depends(require("caixa"))):
    if independent_cash():
        return await with_order_transaction(lambda session: apply_cash_move(body, user, session=session))
    return await apply_cash_move(body, user)


async def apply_cash_move(body: CashMoveIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    s = await current_cash(**cash_scope(user), **options)
    if independent_cash() and not body.client_ref:
        raise HTTPException(422, "Atualize o Apollo para enviar a referência da movimentação.")
    if not s and independent_cash() and body.expected_session_id:
        s = await db.cash_sessions.find_one(
            {"id": body.expected_session_id, "opened_by_id": user["id"]}, {"_id": 0}, **options)
    if not s:
        raise HTTPException(400, "Nenhum caixa aberto")
    if body.expected_session_id is not None and body.expected_session_id != s["id"]:
        raise HTTPException(409, "O turno do caixa mudou. Atualize antes de tentar novamente.")
    fingerprint = hashlib.sha256(json.dumps(
        {"type": body.type, "amount": body.amount, "note": body.note.strip()},
        sort_keys=True).encode()).hexdigest()
    if body.client_ref:
        previous = next((m for m in s.get("movements", []) if m.get("client_ref") == body.client_ref), None)
        if previous:
            if previous.get("request_fingerprint") != fingerprint:
                raise HTTPException(409, "Referência de movimentação reutilizada com outros dados.")
            return await cash_summary(s, **options)
    if s["status"] != "aberto":
        raise HTTPException(409, "Caixa já fechado; nenhuma movimentação registrada.")
    if body.type == "sangria" and len(body.note.strip()) < 3:
        raise HTTPException(400, "Informe o motivo da sangria (mínimo de 3 caracteres)")
    if body.type == "sangria" and body.amount > (await cash_summary(dict(s), **options))["expected_cash"]:
        raise HTTPException(400, "Sangria maior que o saldo em dinheiro")
    await claim_cash(s, session=session)
    m = CashMovement(type=body.type, amount=body.amount, note=body.note.strip(), by_name=user["name"], client_ref=body.client_ref, request_fingerprint=fingerprint).model_dump()
    result = await db.cash_sessions.update_one({"id": s["id"], "status": "aberto",
        "$expr": {"$eq": [{"$size": {"$ifNull": ["$movements", []]}}, len(s.get("movements", []))]}}, {"$push": {"movements": m, "audit_events": audit_event("cash_" + body.type, user, reason=body.note, values={"amount": body.amount})}}, **options)
    if not result.modified_count:
        raise HTTPException(409, "O caixa mudou durante a operação. Atualize o saldo antes de tentar novamente.")
    return await cash_summary(await db.cash_sessions.find_one({"id": s["id"]}, {"_id": 0}, **options), **options)


@router.post("/cash/close", response_model=CashSession)
async def cash_close(body: CashCloseIn, user: dict = Depends(require("caixa"))):
    if independent_cash():
        return await with_order_transaction(lambda session: apply_cash_close(body, user, session=session))
    return await apply_cash_close(body, user)


async def apply_cash_close(body: CashCloseIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    s = await current_cash(**cash_scope(user), **options)
    if not s:
        raise HTTPException(400, "Nenhum caixa aberto")
    if body.expected_session_id is not None and body.expected_session_id != s["id"]:
        raise HTTPException(409, "O turno do caixa mudou. Atualize antes de tentar novamente.")
    if (body.expected_financial_revision is not None
            and body.expected_financial_revision != s.get("financial_revision", 0)):
        raise HTTPException(409, "Houve recebimentos durante a conferência. Atualize e confira o dinheiro novamente.")
    await claim_cash(s, session=session)
    s["counted_amount"] = body.counted_amount
    s = await cash_summary(s, **options)
    upd = {k: s[k] for k in ("totals_by_method", "sales_count", "sales_total", "expected_cash", "difference", "counted_amount")}
    upd["refund_adjustments"] = s.get("refund_adjustments", [])
    upd.update(status="fechado", closed_at=now(), closed_by_name=user["name"])
    result = await db.cash_sessions.update_one(
        {"id": s["id"], "status": "aberto",
         "$expr": {"$eq": [{"$size": {"$ifNull": ["$movements", []]}}, len(s.get("movements", []))]}},
        {"$set": {**upd, "closing_note": body.note.strip()},
         "$push": {"audit_events": audit_event("cash_closed", user, reason=body.note.strip(), values=upd)}},
        **options,
    )
    if not result.modified_count:
        raise HTTPException(409, "O caixa mudou durante o fechamento. Atualize a conferência antes de tentar novamente.")
    return await db.cash_sessions.find_one({"id": s["id"]}, {"_id": 0}, **options)


@router.get("/audit/operations")
async def operational_audit(action: Optional[str] = None, record_id: Optional[str] = None,
                            limit: int = Query(default=100, ge=1, le=500),
                            _: dict = Depends(require())):
    """Admin-only read view; never expose order/customer/payment payloads."""
    events = []
    for name in ("orders", "cash_sessions", "cash_adjustments", "kitchen_tickets"):
        match = {"id": record_id} if record_id else {}
        pipeline = [{"$match": match}, {"$project": {"_id": 0, "id": 1, "audit_events": 1}},
                    {"$unwind": "$audit_events"}]
        if action:
            pipeline.append({"$match": {"audit_events.action": action}})
        pipeline.extend([{"$set": {"audit_sort_at": {"$convert": {"input": "$audit_events.at", "to": "date", "onError": None, "onNull": None}}}},
                         {"$sort": {"audit_sort_at": -1}}, {"$limit": limit}])
        rows = await db[name].aggregate(pipeline).to_list(limit)
        for row in rows:
            event = row["audit_events"]
            events.append({"source": name, "record_id": row["id"], "event": event, "integrity": verify_event(event)})
    def event_time(row):
        value = row["event"].get("at")
        try:
            return value.timestamp() if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
        except (ValueError, TypeError, OverflowError):
            return 0
    events.sort(key=event_time, reverse=True)
    return {"events": events[:limit], "limit": limit,
            "signing_configured": len(os.environ.get("AUDIT_SIGNING_KEY", "")) >= 32}


@router.get("/audit/alerts")
async def administrative_audit_alerts(user: dict = Depends(require())):
    sample = await operational_audit(action=None, record_id=None, limit=500, _=user)
    return {"alerts": summarize_audit_alerts(sample["events"]),
            "sample_size": len(sample["events"]), "sample_limit": 500,
            "sample_limit_reached": len(sample["events"]) == 500,
            "notice": "Indicadores para revisão na amostra recente; não comprovam fraude e não executam bloqueios."}
