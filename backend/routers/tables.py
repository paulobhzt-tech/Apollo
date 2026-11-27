import hashlib
import json
import re
from uuid import uuid4
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from lib.audit import audit_event
from lib.table_receipts import cents, guard_open_receipts, pix_references, require_receipt_transaction
from lib.cash_scope import cash_scope, claim_cash, independent_cash
from lib.auth import authenticated_identity, cancel_authorizer, current_user, require
from lib.db import client, db
from lib.sync_identity import sync_context, validate_sync_context
from lib.orders import (build_items, card_payment_audit, compute_subtotal, create_ticket, current_cash, finalize_payment, free_table, method_totals, move_stock, new_order, next_seq, now, order_for_operator, validate_methods, validate_payment_details,
                        refresh_totals)
from models.schemas import (SaleQuantity, AddItemsIn, CancelIn, OkOut, OpenTableIn, Order, OrderItem, PayIn, PrintAttempt, SaleResult, Table, TableIn,
                            OrderItemIn, Payment, SyncContext, TablePayIn, TableStatusIn, TableUpdate, TransferIn, table_label)

from routers.operations import with_order_transaction

router = APIRouter()
STAFF = ("caixa", "garcom")


async def get_table(id: str, **options) -> dict:
    t = await db.tables.find_one({"id": id}, {"_id": 0}, **options)
    if not t:
        raise HTTPException(404, "Mesa não encontrada")
    return t


async def get_or_open_order(table: dict, waiter: dict | None = None, source: str = "mesa", *, opening_customer: str | None = None, **options) -> dict:
    """Return the table's open order, opening the table if it is free."""
    if table.get("order_id"):
        o = await db.orders.find_one({"id": table["order_id"], "status": "aberto"}, {"_id": 0}, **options)
        if o:
            return o
    order = await new_order(channel="mesa", source=source, table_id=table["id"], table_number=table["number"],
                            table_label=table_label(table),
                            waiter_id=waiter["id"] if waiter else None, waiter_name=waiter["name"] if waiter else "", **options)
    fields = {
        "status": "ocupada", "order_id": order["id"], "opened_at": now(), "people": table.get("people") or 1,
        "waiter_id": order["waiter_id"], "waiter_name": order["waiter_name"],
    }
    if opening_customer is not None:
        fields["customer_name"] = opening_customer
    result = await db.tables.update_one(
        {"id": table["id"], "order_id": table.get("order_id")},
        {"$set": fields}, **options,
    )
    if not result.matched_count:
        if options.get("session") is None:
            # Preserve the sequence and audit context without leaving a second active bill.
            await db.orders.update_one({"id": order["id"], "status": "aberto"}, {"$set": {
                "status": "cancelado", "cancel_reason": "Abertura concorrente da mesa", "cancelled_at": now(),
            }})
        raise HTTPException(409, "Mesa alterada por outro atendimento. Atualize o mapa.")
    return order


@router.get("/tables", response_model=list[Table])
async def list_tables(_: dict = Depends(current_user)):
    return await db.tables.find({}, {"_id": 0}).sort([("kind", -1), ("number", 1)]).to_list(1000)


@router.post("/tables", response_model=Table)
async def create_table(body: TableIn, _: dict = Depends(require("caixa"))):
    if await db.tables.find_one({"number": body.number, "kind": body.kind}):
        raise HTTPException(400, f"{'Comanda' if body.kind == 'comanda' else 'Mesa'} {body.number} já existe")
    t = Table(**body.model_dump()).model_dump()
    await db.tables.insert_one(dict(t))
    return t


@router.put("/tables/{id}", response_model=Table)
async def update_table(id: str, body: TableUpdate, _: dict = Depends(require(*STAFF))):
    t = await get_table(id)
    await db.tables.update_one({"id": id}, {"$set": body.model_dump()})
    if t.get("order_id"):
        await db.orders.update_one({"id": t["order_id"]}, {"$set": {"table_label": table_label({**t, **body.model_dump()})}})
    return await get_table(id)


@router.delete("/tables/{id}", response_model=OkOut)
async def delete_table(id: str, _: dict = Depends(require("caixa"))):
    t = await get_table(id)
    if t["status"] in ("ocupada", "conta"):
        raise HTTPException(400, "Mesa ocupada não pode ser removida")
    await db.tables.delete_one({"id": id})
    return OkOut()


@router.post("/tables/{id}/open", response_model=Table)
async def open_table(id: str, body: OpenTableIn, user: dict = Depends(require(*STAFF))):
    async def open_in_session(session):
        options = {"session": session} if session is not None else {}
        t = await get_table(id, **options)
        if t.get("order_id"):
            raise HTTPException(400, "Mesa já está aberta")
        await get_or_open_order(
            {**t, "people": body.people}, user, opening_customer=body.customer_name, **options,
        )
        return await get_table(id, **options)

    return await with_order_transaction(open_in_session)


class RegisteredCustomerIn(BaseModel):
    order_id: str = Field(min_length=1, max_length=128)
    customer_id: str = Field(min_length=1, max_length=128)


@router.get("/tables/customer-search")
async def search_registered_customers(q: str = Query(min_length=2, max_length=80), _: dict = Depends(require(*STAFF))):
    if len(q.strip()) < 2:
        return []
    return await db.fiado_customers.find(
        {"name": {"$regex": re.escape(q.strip()), "$options": "i"}}, {"_id": 0, "id": 1, "name": 1},
    ).sort([("name", 1), ("id", 1)]).limit(20).to_list(20)


@router.put("/tables/{id}/registered-customer", response_model=Order)
async def link_registered_customer(id: str, body: RegisteredCustomerIn, user: dict = Depends(require(*STAFF))):
    table = await get_table(id)
    if table.get("order_id") != body.order_id:
        raise HTTPException(409, "Atendimento alterado. Atualize antes de vincular.")
    customer = await db.fiado_customers.find_one({"id": body.customer_id}, {"_id": 0, "name": 1})
    if not customer:
        raise HTTPException(404, "Cliente cadastrado não encontrado.")
    order = await db.orders.find_one_and_update(
        {"id": body.order_id, "table_id": id, "status": "aberto"},
        {"$set": {"registered_customer_id": body.customer_id, "registered_customer_name": customer["name"]},
         "$push": {"audit_events": audit_event("registered_customer_linked", user,
                                               values={"registered_customer_id": body.customer_id})}},
        projection={"_id": 0}, return_document=True,
    )
    if not order:
        raise HTTPException(409, "Atendimento alterado. Atualize antes de vincular.")
    return order_for_operator(order, user)


class TableCustomersIn(BaseModel):
    customers: list[str] = Field(max_length=50)


@router.put("/tables/{id}/customers", response_model=Table)
async def set_table_customers(id: str, body: TableCustomersIn, _: dict = Depends(require(*STAFF))):
    """Assign multiple named guests to one open table without changing its bill."""
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Abra a mesa antes de cadastrar clientes")
    customers = [name.strip() for name in body.customers]
    if any(not name or len(name) > 80 for name in customers):
        raise HTTPException(400, "Informe nomes de 1 a 80 caracteres")
    if len(set(name.casefold() for name in customers)) != len(customers):
        raise HTTPException(400, "Não repita o mesmo nome na mesa")
    result = await db.tables.update_one(
        {"id": id, "order_id": t["order_id"], "status": {"$in": ["ocupada", "conta"]}},
        {"$set": {"customers": customers, "people": max(1, len(customers)),
                  "customer_name": ", ".join(customers)[:160]}})
    if result.matched_count != 1:
        raise HTTPException(409, "Mesa foi fechada ou alterada. Atualize antes de cadastrar clientes.")
    return await get_table(id)


@router.patch("/tables/{id}/status", response_model=Table)
async def set_table_status(id: str, body: TableStatusIn, _: dict = Depends(require(*STAFF))):
    t = await get_table(id)
    if body.status == "conta":
        if not t.get("order_id"):
            raise HTTPException(400, "Mesa sem comanda aberta")
        await db.tables.update_one({"id": id}, {"$set": {"status": "conta", "call": ""}})
    elif t.get("order_id"):
        if body.status != "ocupada":
            raise HTTPException(400, "Mesa com consumo: feche a conta, cancele ou libere antes")
        await db.tables.update_one({"id": id}, {"$set": {"status": "ocupada"}})
    else:
        await db.tables.update_one({"id": id}, {"$set": {"status": body.status}})
    return await get_table(id)


@router.post("/tables/{id}/release", response_model=Table)
async def release_table(id: str, user: dict = Depends(require(*STAFF))):
    """Liberar: frees a table/comanda that has nothing to charge (empty or every item cancelled)."""
    async def apply(session):
        options = {"session": session} if session is not None else {}
        t = await get_table(id, **options)
        if t.get("order_id"):
            order = await db.orders.find_one({"id": t["order_id"]}, {"_id": 0, "items": 1, "status": 1, "advance_paid": 1}, **options)
            if order and order["status"] == "aberto":
                guard_open_receipts(order)
                if any(not i.get("cancelled") for i in order["items"]):
                    raise HTTPException(400, "Há itens na comanda: feche a conta ou cancele a mesa")
                result = await db.orders.update_one(
                    {"id": t["order_id"], "status": "aberto", "items": order["items"]},
                    {"$set": {"status": "cancelado", "cancel_reason": "Liberada sem consumo",
                              "cancelled_by": user["name"], "cancelled_at": now()}}, **options)
                if not result.modified_count:
                    raise HTTPException(409, "A comanda mudou. Atualize a mesa antes de liberar.")
                await db.kitchen_tickets.update_many({"order_id": t["order_id"]},
                    {"$set": {"status": "entregue"}}, **options)
        await free_table(id, expected_order_id=t.get("order_id"), **options)
        return await get_table(id, **options)

    return await with_order_transaction(apply)


@router.post("/tables/{id}/cancel", response_model=Table)
async def cancel_table(id: str, body: CancelIn, user: dict = Depends(current_user)):
    """Cancels the whole open order of a table/comanda (stock returned, tickets closed) and frees it. Needs cancel permission or a manager PIN."""
    from routers.operations import cancel_order
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Mesa sem comanda aberta")
    await cancel_order(t["order_id"], body, user)
    return await get_table(id)


@router.post("/tables/{id}/clear-call", response_model=Table)
async def clear_call(id: str, _: dict = Depends(require(*STAFF))):
    await get_table(id)
    await db.tables.update_one({"id": id}, {"$set": {"call": ""}})
    return await get_table(id)


@router.get("/tables/{id}/order", response_model=Order | None)
async def table_order(id: str, user: dict = Depends(current_user)):
    t = await get_table(id)
    if not t.get("order_id"):
        return None
    order = await db.orders.find_one({"id": t["order_id"]}, {"_id": 0})
    return order_for_operator(order, user)


@router.get("/tables/{id}/item-progress", response_model=dict[str, str])
async def table_item_progress(id: str, _: dict = Depends(require(*STAFF))):
    table = await get_table(id)
    if not table.get("order_id"):
        return {}
    progress = {}
    async for ticket in db.kitchen_tickets.find({"order_id": table["order_id"]}, {"status": 1, "items.order_item_id": 1}):
        for item in ticket.get("items", []):
            if item.get("order_item_id"):
                progress[item["order_item_id"]] = ticket["status"]
    return progress


class TablePrintStatus(BaseModel):
    ticket_id: str
    station: str
    created_at: datetime
    printed: bool
    attempt: PrintAttempt | None = None
    item_ids: list[str] = Field(default_factory=list)


@router.get("/tables/{id}/print-status", response_model=list[TablePrintStatus])
async def table_print_status(id: str, order_id: str, _: dict = Depends(require(*STAFF))):
    table = await get_table(id)
    if table.get("order_id") != order_id:
        raise HTTPException(409, "Atendimento alterado. Atualize a mesa.")
    response = []
    query = {"order_id": order_id, "items": {"$elemMatch": {"print_ticket": {"$ne": False}}}}
    projection = {"id": 1, "created_at": 1, "items.station": 1, "items.print_ticket": 1, "items.order_item_id": 1,
                  "printed": 1, "print_attempts": 1}
    tickets = db.kitchen_tickets.find(query, projection).sort("created_at", -1).limit(100)
    async for ticket in tickets:
        attempts = {attempt["station"]: attempt for attempt in ticket.get("print_attempts", [])}
        stations = sorted({item.get("station", "cozinha") for item in ticket["items"] if item.get("print_ticket") is not False})
        for station in stations:
            response.append(TablePrintStatus(
                ticket_id=ticket["id"], station=station, created_at=ticket["created_at"],
                printed=station in ticket.get("printed", []), attempt=attempts.get(station),
                item_ids=list(dict.fromkeys(
                    item["order_item_id"] for item in ticket["items"]
                    if item.get("order_item_id") and item.get("print_ticket") is not False
                    and item.get("station", "cozinha") == station
                )),
            ))
    return response


@router.post("/tables/{id}/items", response_model=Order)
async def add_items(id: str, body: AddItemsIn, user: dict = Depends(require(*STAFF))):
    await validate_sync_context(body.sync_context, user)
    order = await with_order_transaction(lambda session: apply_add_items(id, body, user, session=session))
    return order_for_operator(order, user)


async def apply_add_items(id: str, body: AddItemsIn, user: dict, *, session=None, expected_prices=None):
    options = {"session": session} if session is not None else {}
    t = await get_table(id, **options)
    if body.client_ref and not body.order_id:
        raise HTTPException(400, "Informe o pedido para identificar o envio.")
    if body.order_id and t.get("order_id") != body.order_id:
        raise HTTPException(409, "Atendimento alterado. Atualize antes de enviar.")
    batch_key = hashlib.sha256(f"{user['id']}:{body.client_ref}".encode()).hexdigest()
    fingerprint = hashlib.sha256(body.model_dump_json(exclude={"sync_context"}).encode()).hexdigest()
    if body.order_id:
        order = await db.orders.find_one({"id": body.order_id, "status": "aberto"}, {"_id": 0}, **options)
        if not order:
            raise HTTPException(409, "O pedido já foi encerrado.")
        if body.client_ref:
            batch = order.get("table_item_batches", {}).get(batch_key)
            if batch:
                if batch["fingerprint"] != fingerprint:
                    raise HTTPException(409, "Este envio já foi usado com outros itens.")
                if not batch["complete"] and batch.get("stage") == "stock_recorded":
                    updated = await refresh_totals(order["id"], **options)
                    await db.orders.update_one(
                        {"id": order["id"], f"table_item_batches.{batch_key}.stage": "stock_recorded"},
                        {"$set": {f"table_item_batches.{batch_key}.complete": True,
                                  f"table_item_batches.{batch_key}.stage": "complete"}},
                        **options,
                    )
                    return updated
                if not batch["complete"]:
                    raise HTTPException(409, "Envio pendente de conferência. Atualize a comanda e verifique o preparo e o estoque antes de reenviar.")
                return order
    else:
        order = await get_or_open_order(t, user, **options)
    items = await build_items(body.items, channel="comanda")
    if expected_prices is not None and any(item.unit_price != price for item, price in zip(items, expected_prices)):
        raise HTTPException(409, "Preço alterado desde o preparo do pedido. Revise o envio.")
    customers = t.get("customers") or ([t["customer_name"]] if t.get("customer_name") else [])
    for entry, item in zip(body.items, items):
        guest = entry.customer_name.strip()
        if guest and guest not in customers:
            raise HTTPException(400, "Cliente não cadastrado nesta mesa")
        item.customer_name = guest
        item.ordered_by = user["name"]
        item.ordered_at = now()
    condition = {"id": order["id"], "status": "aberto"}
    changes = {"$push": {"items": {"$each": [i.model_dump() for i in items]}}}
    if body.client_ref:
        batch_field = f"table_item_batches.{batch_key}"
        condition[batch_field] = {"$exists": False}
        changes["$set"] = {batch_field: {"fingerprint": fingerprint, "complete": False, "stage": "items_recorded",
                                          "item_ids": [item.id for item in items],
                                          "operator_id": user["id"], "operator_name": user["name"], "created_at": now()}}
    result = await db.orders.update_one(condition, changes, **options)
    if result.modified_count != 1:
        raise HTTPException(409, "Comanda foi fechada ou alterada. Atualize a mesa antes de lançar itens.")
    await create_ticket(order, items, **options)
    if body.client_ref:
        await db.orders.update_one({"id": order["id"]}, {"$set": {f"{batch_field}.stage": "ticket_recorded"}}, **options)
    await move_stock(items, user["name"], f"{table_label(t)} · Pedido #{order['number']}", **options)
    if body.client_ref:
        await db.orders.update_one({"id": order["id"]}, {"$set": {f"{batch_field}.stage": "stock_recorded"}}, **options)
    updated = await refresh_totals(order["id"], **options)
    if body.client_ref:
        await db.orders.update_one({"id": order["id"]}, {"$set": {f"{batch_field}.complete": True, f"{batch_field}.stage": "complete"}}, **options)
    return updated


@router.get("/offline/table-profile")
async def offline_table_profile(response: Response, identity: tuple = Depends(authenticated_identity)):
    user, session_expires_at = identity
    if user["role"] not in ("admin", *STAFF):
        raise HTTPException(403, "Perfil sem permissão para o cofre local.")
    response.headers["Cache-Control"] = "no-store"
    products = await db.products.find(
        {"active": True}, {"_id": 0, "id": 1, "name": 1, "price": 1, "options": 1, "channels": 1},
    ).sort("name", 1).to_list(2000)
    scope = {"waiter_id": user["id"], "status": "ocupada", "order_id": {"$type": "string"}} if user["role"] == "garcom" else {}
    tables = await db.tables.find(scope, {
        "_id": 0, "id": 1, "order_id": 1, "number": 1, "kind": 1, "name": 1, "status": 1,
    }).to_list(1000)
    issued_at = datetime.now(timezone.utc)
    return {
        "context": await sync_context(user),
        "operator": user["name"],
        "can_create": user["role"] in ("admin", "caixa"),
        "issued_at": issued_at,
        "expires_at": min(session_expires_at, issued_at + timedelta(hours=8)),
        "products": [{"id": item["id"], "name": item["name"], "price": round(item["price"], 2)} for item in products
                     if not any(group.get("required") for group in item.get("options", []))
                     and "comanda" in item.get("channels", ["comanda"])],
        "tables": tables,
    }


class OfflineTableItemIn(OrderItemIn):
    model_config = ConfigDict(extra="forbid")

    expected_price: float = Field(ge=0, allow_inf_nan=False)


class OfflineTableTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    table_id: str = Field(min_length=1, max_length=128)
    order_id: str = Field(min_length=1, max_length=128)


class OfflineTableIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_ref: str = Field(min_length=16, max_length=128)
    sync_context: SyncContext
    table: TableIn
    existing: OfflineTableTarget | None = None
    items: list[OfflineTableItemIn] = Field(min_length=1, max_length=100)


class OfflineTableReceipt(BaseModel):
    table_id: str
    order_id: str


@router.post("/offline/tables", response_model=OfflineTableReceipt)
async def sync_offline_table(body: OfflineTableIn, user: dict = Depends(require(*STAFF))):
    if body.existing is None and user["role"] == "garcom":
        raise HTTPException(403, "Garçom só pode enviar itens para seu atendimento existente.")
    await validate_sync_context(body.sync_context, user)
    key = hashlib.sha256(json.dumps([body.sync_context.model_dump(), body.client_ref]).encode()).hexdigest()
    # Preserve receipts already issued for P54 drafts without an existing target.
    serialized = body.model_dump_json(exclude={"existing"} if body.existing is None else None)
    fingerprint = hashlib.sha256(serialized.encode()).hexdigest()

    batch_key = hashlib.sha256(f"{user['id']}:{body.client_ref}".encode()).hexdigest()

    async def receipt(record, **options):
        if record["fingerprint"] != fingerprint:
            raise HTTPException(409, "Referência já usada com dados diferentes.")
        if not await db.orders.find_one({
            "id": record["order_id"], f"table_item_batches.{batch_key}.complete": True,
        }, {"_id": 1}, **options):
            raise HTTPException(409, "Recibo sem lançamento correspondente no banco atual. Confira a restauração antes de reenviar.")
        return {"table_id": record["table_id"], "order_id": record["order_id"]}

    async def apply(session):
        if session is None:
            raise HTTPException(503, "Sincronização de mesas exige transações no banco.")
        options = {"session": session}
        previous = await db.offline_table_receipts.find_one({"_id": key}, **options)
        if previous:
            return await receipt(previous, **options)
        if body.existing:
            table = await db.tables.find_one({"id": body.existing.table_id}, **options)
            if not table or table.get("order_id") != body.existing.order_id or table.get("status") != "ocupada":
                raise HTTPException(409, "Atendimento mudou desde a última consulta. Revise o envio.")
            if user["role"] == "garcom" and table.get("waiter_id") != user["id"]:
                raise HTTPException(409, "Atendimento atribuído a outro operador. Revise o envio.")
            order_id = body.existing.order_id
        else:
            table = Table(**body.table.model_dump()).model_dump()
            await db.tables.insert_one(dict(table), **options)
            order_id = (await get_or_open_order(table, user, **options))["id"]
        await apply_add_items(table["id"], AddItemsIn(
            order_id=order_id, client_ref=body.client_ref, items=[OrderItemIn.model_validate(item.model_dump(exclude={"expected_price"})) for item in body.items],
        ), user, expected_prices=[item.expected_price for item in body.items], **options)
        record = {"_id": key, "fingerprint": fingerprint, "table_id": table["id"], "order_id": order_id}
        await db.offline_table_receipts.insert_one(record, **options)
        return await receipt(record, **options)

    try:
        return await with_order_transaction(apply)
    except DuplicateKeyError:
        previous = await db.offline_table_receipts.find_one({"_id": key})
        if previous:
            return await receipt(previous)
        raise HTTPException(409, "Já existe mesa ou comanda com este número. Revise o envio.") from None


@router.post("/tables/{id}/items/{item_id}/cancel", response_model=Order)
async def cancel_item(id: str, item_id: str, body: CancelIn, user: dict = Depends(current_user)):
    auth = await cancel_authorizer(user, body.manager_pin)
    order = await with_order_transaction(lambda session: apply_cancel_item(id, item_id, body, user, auth, session=session))
    return order_for_operator(order, user)


async def apply_cancel_item(id: str, item_id: str, body: CancelIn, user: dict, auth: str, *, session=None):
    options = {"session": session} if session is not None else {}
    t = await get_table(id, **options)
    order = await db.orders.find_one({"id": t.get("order_id"), "status": "aberto"}, {"_id": 0}, **options)
    if not order:
        raise HTTPException(400, "Mesa sem comanda aberta")
    guard_open_receipts(order)
    item = next((i for i in order["items"] if i["id"] == item_id and not i.get("cancelled")), None)
    if not item:
        raise HTTPException(404, "Item não encontrado")
    reason = body.reason if auth == user["name"] else f"{body.reason} (autorizado por {auth})"
    from models.schemas import OrderItem
    qty = body.qty if body.qty and body.qty < item["qty"] else item["qty"]
    if item.get("sale_unit", "un") == "un" and qty != int(qty):
        raise HTTPException(400, "Informe uma quantidade inteira para este produto")
    updated_items = [
        ({**entry, "qty": round(entry["qty"] - qty, 4)} if qty < entry["qty"]
         else {**entry, "cancelled": True, "cancel_reason": reason})
        if entry["id"] == item_id else entry
        for entry in order["items"]
    ]
    if qty < item["qty"]:
        removed = OrderItem(**{**item, "id": OrderItem.model_fields["id"].default_factory(),
                               "qty": qty, "cancelled": True, "cancel_reason": reason})
        updated_items.append(removed.model_dump())
    result = await db.orders.update_one(
        {"id": order["id"], "status": "aberto", "items": order["items"]},
        {"$set": {"items": updated_items}, "$push": {"audit_events": audit_event(
            "item_cancelled", user, reason=body.reason, authorized_by=auth, values={"item_id": item_id, "qty": qty, "before_qty": item["qty"], "before_total": round(item["qty"] * item["unit_price"], 2),
                    "after_qty": round(item["qty"] - qty, 4), "after_total": round((item["qty"] - qty) * item["unit_price"], 2)},
        )}},
        **options,
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Pedido alterado durante o cancelamento. Atualize a comanda.")
    await move_stock([OrderItem(**{**item, "qty": qty})], user["name"], f"Cancelamento: {body.reason}", sign=1, **options)
    return await refresh_totals(order["id"], **options)


@router.post("/tables/{id}/transfer", response_model=Table)
async def transfer(id: str, body: TransferIn, _: dict = Depends(require(*STAFF))):
    if id == body.target_table_id:
        raise HTTPException(400, "Selecione uma mesa de destino diferente da origem")
    return await with_order_transaction(lambda session: apply_transfer(id, body.target_table_id, session=session))


async def apply_transfer(id: str, target_id: str, *, session=None):
    options = {"session": session} if session is not None else {}
    src = await get_table(id, **options)
    dst = await get_table(target_id, **options)
    if not src.get("order_id"):
        raise HTTPException(400, "Mesa de origem sem comanda")
    if dst.get("order_id") or dst["status"] != "livre":
        raise HTTPException(400, "Mesa de destino precisa estar livre e não reservada")
    order_id = src["order_id"]
    order = await db.orders.find_one({"id": order_id}, {"advance_paid": 1}, **options)
    guard_open_receipts(order or {})
    destination_label = table_label(dst)
    updated_order = await db.orders.update_one(
        {"id": order_id, "status": "aberto", "table_id": {"$in": [id, None]}},
        {"$set": {"table_id": target_id, "table_number": dst["number"], "table_label": destination_label}},
        **options)
    if updated_order.matched_count != 1:
        raise HTTPException(409, "Comanda alterada. Atualize as mesas.")

    keep = Table.model_validate(src).model_dump(include={
        "status", "customer_name", "customers", "people", "waiter_id", "waiter_name",
        "order_id", "opened_at", "total", "call",
    })
    split_request = src.get("split_request")
    update = {"$set": keep}
    if split_request and split_request.get("order_id") == order_id:
        keep["split_request"] = split_request
    else:
        update["$unset"] = {"split_request": ""}
    updated_table = await db.tables.update_one(
        {"id": target_id, "order_id": None, "status": "livre"}, update, **options)
    if updated_table.matched_count != 1:
        raise HTTPException(409, "Mesa de destino foi ocupada. Atualize as mesas.")
    await db.kitchen_tickets.update_many(
        {"order_id": order_id}, {"$set": {"label": destination_label}}, **options)
    await free_table(id, expected_order_id=order_id, **options)
    return await get_table(target_id, **options)


class SelectedItemsIn(BaseModel):
    source_order_id: str = Field(min_length=1, max_length=128)
    target_table_id: str = Field(min_length=1, max_length=128)
    target_order_id: str = Field(min_length=1, max_length=128)
    item_quantities: dict[str, SaleQuantity] = Field(min_length=1, max_length=100)
    operation: Literal["transfer", "copy"]
    client_ref: str = Field(min_length=6, max_length=128)


@router.post("/tables/{id}/selected-items", response_model=OkOut)
async def selected_table_items(id: str, body: SelectedItemsIn, user: dict = Depends(require("caixa"))):
    if id == body.target_table_id or body.source_order_id == body.target_order_id:
        raise HTTPException(400, "Escolha um atendimento de destino diferente.")
    try:
        await with_order_transaction(lambda session: apply_selected_items(id, body, user, session=session))
    except DuplicateKeyError as exc:
        # The winning transaction owns this reference. The same request can be retried.
        raise HTTPException(409, "Operação concorrente. Confira o destino antes de tentar novamente.") from exc
    return OkOut(ok=True, message="Itens registrados no destino.")


async def apply_selected_items(id: str, body: SelectedItemsIn, user: dict, *, session):
    if session is None:
        raise HTTPException(503, "Transferir ou copiar itens exige MongoDB com transações.")
    key = hashlib.sha256(f"{user['id']}:{body.client_ref}".encode()).hexdigest()
    payload = body.model_dump(exclude={"client_ref"})
    fingerprint = hashlib.sha256(json.dumps([id, payload], sort_keys=True).encode()).hexdigest()
    previous = await db.table_item_operations.find_one({"_id": key}, session=session)
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise HTTPException(409, "Referência já utilizada com outra seleção.")
        return

    src = await get_table(id, session=session)
    dst = await get_table(body.target_table_id, session=session)
    if src.get("order_id") != body.source_order_id or dst.get("order_id") != body.target_order_id:
        raise HTTPException(409, "Origem ou destino foi alterado.")
    source = await db.orders.find_one({"id": body.source_order_id, "table_id": id, "status": "aberto"}, session=session)
    target = await db.orders.find_one({"id": body.target_order_id, "table_id": dst["id"], "status": "aberto"}, session=session)
    if not source or not target:
        raise HTTPException(409, "Origem e destino precisam estar abertos.")
    for order in (source, target):
        if order.get("payments") or order.get("advance_paid", 0) or any(not batch.get("complete") for batch in order.get("table_item_batches", {}).values()):
            raise HTTPException(409, "Confira os pagamentos e envios pendentes antes de continuar.")

    ids = set(body.item_quantities)
    chosen = [item for item in source["items"] if item["id"] in ids and not item.get("cancelled")]
    if len(chosen) != len(ids) or any(item["qty"] != body.item_quantities[item["id"]] for item in chosen):
        raise HTTPException(409, "Seleção alterada. Atualize o atendimento.")
    if any(item.get("stock_recipe") is None or (item["stock_recipe"] and not item.get("stock_ref")) for item in chosen):
        raise HTTPException(409, "Itens antigos sem rastreabilidade de estoque exigem revisão administrativa.")
    guests = dst.get("customers") or []
    arriving = [{**item, "customer_name": item.get("customer_name", "") if item.get("customer_name") in guests else ""}
                for item in chosen]
    if body.operation == "copy":
        product_ids = {item["product_id"] for item in arriving}
        available = await db.products.count_documents(
            {"id": {"$in": sorted(product_ids)}, "active": True,
             "$or": [{"channels": "comanda"}, {"channels": {"$exists": False}}]}, session=session)
        ingredients = {entry["ingredient_id"] for item in arriving for entry in item["stock_recipe"]}
        if available != len(product_ids) or (ingredients and await db.ingredients.count_documents(
            {"id": {"$in": sorted(ingredients)}}, session=session,
        ) != len(ingredients)):
            raise HTTPException(409, "Há produtos indisponíveis ou insumos excluídos na seleção.")
        arriving = [{**item, "id": uuid4().hex, "stock_ref": uuid4().hex, "ordered_at": now(),
                     "ordered_by": user["name"], "customer_name": ""} for item in arriving]
        copies = [OrderItem.model_validate(item) for item in arriving]
        await move_stock(copies, user["name"], f"Cópia de itens · Pedido #{target['number']}", session=session)
        await create_ticket(target, copies, session=session)
    else:
        if ids & {item["id"] for item in target["items"]}:
            raise HTTPException(409, "O destino já contém itens da seleção.")
        await move_selected_tickets(source, target, arriving, session=session)

    action = "table_items_copied" if body.operation == "copy" else "table_items_transferred"
    for order, other, items in (
        (source, target, [item for item in source["items"] if item["id"] not in ids] if body.operation == "transfer" else source["items"]),
        (target, source, target["items"] + arriving),
    ):
        result = await db.orders.update_one(
            {"id": order["id"], "status": "aberto", "items": order["items"]},
            {"$set": {"items": items, "cmv": round(sum(item["qty"] * item.get("unit_cost", 0) for item in items if not item.get("cancelled")), 2)},
             "$push": {"audit_events": audit_event(action, user, correlation=body.client_ref,
                    values={"order_number": other["number"], "item_count": len(chosen)})}},
            session=session,
        )
        if result.matched_count != 1:
            raise HTTPException(409, "Atendimento alterado. Nenhuma operação foi concluída.")
        await refresh_totals(order["id"], session=session)
    await db.tables.update_many({"id": {"$in": [src["id"], dst["id"]]}},
                                  {"$unset": {"split_request": ""}}, session=session)
    await db.table_item_operations.insert_one({"_id": key, "fingerprint": fingerprint, "created_at": now()}, session=session)


async def move_selected_tickets(source: dict, target: dict, arriving: list[dict], *, session):
    by_id = {item["id"]: item for item in arriving}
    async for ticket in db.kitchen_tickets.find({"order_id": source["id"]}, {"_id": 0}, session=session):
        if any(not item.get("order_item_id") for item in ticket["items"]):
            raise HTTPException(409, "Há registros antigos de preparo sem vínculo com o lançamento. Revise o pedido.")
        moving = [{**item, "customer_name": by_id[item["order_item_id"]]["customer_name"]}
                  for item in ticket["items"] if item["order_item_id"] in by_id]
        if not moving:
            continue
        staying = [item for item in ticket["items"] if item["order_item_id"] not in by_id]
        destination = {"order_id": target["id"], "order_number": target["number"], "label": target["table_label"],
                       "table_id": target["table_id"], "table_number": target["table_number"], "items": moving}
        if staying:
            await db.kitchen_tickets.update_one({"id": ticket["id"]}, {"$set": {"items": staying}}, session=session)
            await db.kitchen_tickets.insert_one({**ticket, **destination, "id": uuid4().hex, "audit_events": []}, session=session)
        else:
            await db.kitchen_tickets.update_one({"id": ticket["id"]}, {"$set": destination}, session=session)


class MergeTablesIn(BaseModel):
    target_table_id: str = Field(min_length=1)


@router.post("/tables/{id}/merge", response_model=Table)
async def merge_tables(id: str, body: MergeTablesIn, _: dict = Depends(require("caixa"))):
    """Join two open bills atomically without creating a sale or moving stock again.

    Destination remains open; source order is archived as merged. Requires MongoDB
    replica-set transactions so failures never leave half-merged bills.
    """
    if id == body.target_table_id:
        raise HTTPException(400, "Escolha uma mesa diferente")
    from pymongo.errors import PyMongoError
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                src = await db.tables.find_one({"id": id}, session=session)
                dst = await db.tables.find_one({"id": body.target_table_id}, session=session)
                if not src or not dst:
                    raise HTTPException(404, "Mesa não encontrada")
                if not src.get("order_id") or not dst.get("order_id"):
                    raise HTTPException(400, "As duas mesas precisam estar abertas")
                source = await db.orders.find_one({"id": src["order_id"], "status": "aberto"}, session=session)
                target = await db.orders.find_one({"id": dst["order_id"], "status": "aberto"}, session=session)
                if not source or not target:
                    raise HTTPException(409, "Comanda alterada. Atualize as mesas.")
                if any(order.get("payments") or order.get("advance_paid", 0) for order in (source, target)):
                    raise HTTPException(400, "Não é possível juntar comandas com pagamentos registrados")
                source_items = source.get("items", [])
                target_items = target.get("items", [])
                if {i["id"] for i in target_items} & {i["id"] for i in source_items}:
                    raise HTTPException(409, "Itens duplicados entre comandas; revise antes de juntar")
                all_items = target_items + source_items
                active = [i for i in all_items if not i.get("cancelled")]
                subtotal = round(sum(float(i.get("qty", 0)) * float(i.get("unit_price", 0)) for i in active), 2)
                guests = list(dict.fromkeys((dst.get("customers") or []) + (src.get("customers") or [])))
                result = await db.orders.update_one(
                    {"id": target["id"], "status": "aberto"},
                    {"$set": {"items": all_items, "subtotal": subtotal, "total": subtotal,
                              "cmv": round(sum(float(i.get("qty", 0)) * float(i.get("unit_cost", 0)) for i in active), 2)}},
                    session=session)
                if result.modified_count != 1:
                    raise HTTPException(409, "Destino alterado durante a junção")
                archived = await db.orders.update_one(
                    {"id": source["id"], "status": "aberto"},
                    {"$set": {"status": "cancelado", "cancel_reason": "Conta reunida em outra mesa", "merged_into_order_id": target["id"],
                              "merged_at": now(), "items": [], "subtotal": 0, "total": 0, "cmv": 0}},
                    session=session)
                if archived.modified_count != 1:
                    raise HTTPException(409, "Origem alterada durante a junção")
                await db.kitchen_tickets.update_many(
                    {"order_id": source["id"]},
                    {"$set": {"order_id": target["id"], "table_id": dst["id"], "table_number": dst["number"]}},
                    session=session)
                updated_dst = await db.tables.update_one(
                    {"id": dst["id"], "order_id": target["id"]},
                    {"$set": {"total": subtotal, "customers": guests,
                              "people": max(1, int(src.get("people") or 1) + int(dst.get("people") or 1))}},
                    session=session)
                if updated_dst.modified_count != 1:
                    raise HTTPException(409, "Mesa de destino alterada durante a junção")
                updated_src = await db.tables.update_one(
                    {"id": src["id"], "order_id": source["id"]},
                    {"$set": {"status": "livre", "order_id": None, "total": 0,
                              "customer_name": "", "customers": [], "people": 0,
                              "waiter_id": None, "waiter_name": "", "opened_at": None, "call": ""},
                     "$unset": {"split_request": ""}},
                    session=session)
                if updated_src.modified_count != 1:
                    raise HTTPException(409, "Mesa de origem alterada durante a junção")
    except PyMongoError as exc:
        raise HTTPException(503, "Junção exige MongoDB com transações habilitadas; nenhuma mesa foi alterada") from exc
    return await get_table(body.target_table_id)


@router.get("/tables/split-requests/pending")
async def pending_split_requests(_: dict = Depends(require("caixa"))):
    """Cashier dashboard: pending requests for currently open table orders."""
    tables = await db.tables.find(
        {"split_request": {"$exists": True}, "order_id": {"$ne": None}},
        {"_id": 0, "id": 1, "number": 1, "name": 1, "kind": 1,
         "order_id": 1, "split_request": 1},
    ).to_list(500)
    return [{"table_id": t["id"], "number": t["number"],
             "kind": t.get("kind", "mesa"),
             "subtotal": t["split_request"].get("subtotal", 0),
             "created_at": t["split_request"].get("created_at")}
            for t in tables
            if t["split_request"].get("order_id") == t.get("order_id")]


@router.get("/tables/{id}/split-request")
async def cashier_split_request(id: str, _: dict = Depends(require("caixa"))):
    t = await get_table(id)
    request = t.get("split_request")
    if not request or request.get("order_id") != t.get("order_id"):
        return {"request": None}
    return {"request": request}


@router.delete("/tables/{id}/split-request", response_model=OkOut)
async def clear_split_request(id: str, _: dict = Depends(require("caixa"))):
    await get_table(id)
    await db.tables.update_one({"id": id}, {"$unset": {"split_request": ""}})
    return OkOut(message="Solicitação de divisão removida")


def partial_bill_totals(available: dict, quantities: dict) -> tuple[float, float]:
    """Preserve the rounded value of the open bill when splitting fractional units."""
    before = round(sum(item["qty"] * item["unit_price"] for item in available.values()), 2)
    remaining = round(sum(
        round(item["qty"] - quantities.get(item_id, 0), 4) * item["unit_price"]
        for item_id, item in available.items()
    ), 2)
    return round(before - remaining, 2), remaining


class PartialBillIn(BaseModel):
    """Item quantities to include in a separate bill preview."""
    quantities: dict[str, SaleQuantity] = Field(min_length=1)


@router.post("/tables/{id}/partial-bill/preview")
async def preview_partial_bill(id: str, body: PartialBillIn, _: dict = Depends(require("caixa"))):
    """Read-only preview. Does not receive money, alter stock or close the table."""
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Mesa sem comanda aberta")
    order = await db.orders.find_one({"id": t["order_id"], "status": "aberto"}, {"_id": 0})
    if not order:
        raise HTTPException(400, "Comanda não está aberta")
    guard_open_receipts(order)
    available = {i["id"]: i for i in order["items"] if not i.get("cancelled")}
    chosen = []
    for item_id, qty in body.quantities.items():
        item = available.get(item_id)
        if not item:
            raise HTTPException(400, f"Item indisponível: {item_id}")
        if isinstance(qty, bool) or qty <= 0 or qty > item["qty"] or (item.get("sale_unit", "un") == "un" and qty != int(qty)):
            raise HTTPException(400, f"Quantidade inválida para {item['name']}")
        chosen.append({"item_id": item_id, "name": item["name"], "qty": qty,
                       "unit_price": item["unit_price"], "total": round(qty * item["unit_price"], 2)})
    subtotal, remaining = partial_bill_totals(available, body.quantities)
    return {"table_id": id, "order_id": order["id"], "items": chosen,
            "subtotal": subtotal, "remaining_subtotal": remaining,
            "message": "Prévia apenas: nenhum pagamento foi registrado"}


class PartialPaymentIn(PartialBillIn):
    customer_name: str = Field(default="", max_length=80)
    payment: PayIn
    expected_order_id: str | None = Field(default=None, min_length=1, max_length=120)
    expected_subtotal: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    expected_remaining_subtotal: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    client_ref: str = Field(min_length=6, max_length=120)


@router.post("/tables/{id}/partial-bill/pay", response_model=SaleResult)
async def pay_partial_bill(id: str, body: PartialPaymentIn, user: dict = Depends(require("caixa"))):
    """Atomically move selected units to a separate paid order; never deduct stock twice.

    Requires MongoDB replica-set transactions. Standalone databases fail closed.
    """
    if body.payment.emit_invoice:
        raise HTTPException(400, "Emissão fiscal parcial ainda não habilitada. Use comprovante não fiscal.")
    if body.payment.fiado_customer_id or any(p.method == "fiado" for p in body.payment.payments):
        raise HTTPException(400, "Fiado não está habilitado no pagamento parcial")
    validate_payment_details(body.payment)
    await validate_methods([p.method for p in body.payment.payments])
    if any(p.method in ("credito", "debito") and not p.brand for p in body.payment.payments):
        raise HTTPException(400, "Informe a bandeira do cartão")
    cash = await current_cash(**cash_scope(user))
    if not cash:
        raise HTTPException(400, "Abra o caixa para receber pagamentos")
    request_data = body.model_dump(mode="json", exclude={"client_ref"})
    # Preserve fingerprints of requests sent before the preview fields existed.
    for key in ("expected_order_id", "expected_subtotal", "expected_remaining_subtotal"):
        if request_data[key] is None:
            del request_data[key]
    request_data["table_id"] = id
    fingerprint = hashlib.sha256(json.dumps(
        request_data, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    ).encode()).hexdigest()
    # Allocate the sequence before the transaction: a skipped number is preferable
    # to a non-transactional counter update inside a financial transaction.
    number = await next_seq("order")
    from pymongo.errors import PyMongoError
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                previous = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0}, session=session)
                if previous:
                    if independent_cash():
                        receipt_cash = await db.cash_sessions.find_one({"id": previous.get("cash_session_id")}, session=session)
                        if not receipt_cash or receipt_cash.get("opened_by_id") != user["id"]:
                            raise HTTPException(403, "Pagamento parcial registrado em outro caixa.")
                    parent_id = previous.get("parent_order_id")
                    origin = previous.get("partial_table_id")
                    if parent_id and origin is None:
                        parent = await db.orders.find_one({"id": parent_id}, {"table_id": 1}, session=session)
                        origin = (parent or {}).get("table_id")
                    recorded_fingerprint = previous.get("request_fingerprint")
                    if (not parent_id or origin != id or previous.get("status") != "pago"
                            or (recorded_fingerprint and recorded_fingerprint != fingerprint)):
                        raise HTTPException(409, "Referência de pagamento já usada em outra operação")
                    return {"order": previous, "invoice": None}
                await claim_cash(cash, session=session)
                table = await db.tables.find_one({"id": id}, session=session)
                if not table or not table.get("order_id"):
                    raise HTTPException(400, "Mesa sem comanda aberta")
                if body.expected_order_id is not None and table["order_id"] != body.expected_order_id:
                    raise HTTPException(409, "A comanda mudou. Calcule a divisão novamente.")
                order = await db.orders.find_one({"id": table["order_id"], "status": "aberto"}, session=session)
                if not order:
                    raise HTTPException(409, "Comanda foi alterada ou fechada")
                guard_open_receipts(order)
                chosen = []
                remaining = []
                for item in order["items"]:
                    qty = body.quantities.get(item["id"], 0)
                    if (qty > (0 if item.get("cancelled") else item["qty"])
                            or (item.get("sale_unit", "un") == "un" and qty != int(qty))):
                        raise HTTPException(400, f"Quantidade inválida: {item['name']}")
                    if qty:
                        chosen.append({**item, "qty": qty})
                    if item["qty"] > qty:
                        remaining.append({**item, "qty": round(item["qty"] - qty, 4)})
                if not chosen or any(k not in {i["id"] for i in order["items"]} for k in body.quantities):
                    raise HTTPException(400, "Selecione itens válidos")
                guest = body.customer_name.strip()
                if guest:
                    known = table.get("customers") or []
                    if guest not in known:
                        raise HTTPException(400, "Cliente não cadastrado na mesa")
                    if any(i.get("customer_name") not in ("", guest, None) for i in chosen):
                        raise HTTPException(400, "Há itens de outro cliente na seleção")
                available = {item["id"]: item for item in order["items"] if not item.get("cancelled")}
                subtotal, remaining_sub = partial_bill_totals(available, body.quantities)
                if body.expected_remaining_subtotal is not None and remaining_sub != body.expected_remaining_subtotal:
                    raise HTTPException(409, "O saldo da comanda mudou. Calcule a divisão novamente.")
                if body.expected_subtotal is not None and subtotal != body.expected_subtotal:
                    raise HTTPException(409, "O subtotal mudou. Calcule a divisão novamente.")
                if body.payment.discount > subtotal:
                    raise HTTPException(400, "Desconto maior que o valor dos itens selecionados")
                service_fee = round(subtotal * body.payment.service_pct / 100, 2)
                total = round(subtotal - body.payment.discount + service_fee, 2)
                paid = round(sum(p.amount for p in body.payment.payments), 2)
                change = round(paid - total, 2)
                if change < -0.009:
                    raise HTTPException(400, "Pagamento insuficiente")
                if change > sum(p.amount for p in body.payment.payments if p.method == "dinheiro") + 0.009:
                    raise HTTPException(400, "Troco somente em dinheiro")
                # The separate order has no table_id: it must not release the open table.
                receipt = Order(number=number, channel="mesa", source="mesa",
                    table_number=table["number"], table_label=table_label(table),
                    items=[OrderItem(**i) for i in chosen], status="pago",
                    customer={"name": guest},
                    subtotal=subtotal, discount=body.payment.discount, service_fee=service_fee,
                    total=total, payments=body.payment.payments,
                    change=max(0, change), paid_at=now(), cash_session_id=cash["id"],
                    client_ref=body.client_ref, request_fingerprint=fingerprint, waiter_id=order.get("waiter_id"),
                    waiter_name=order.get("waiter_name", ""),
                    audit_events=[audit_event("partial_payment_recorded", user, correlation=body.client_ref, reason=body.payment.discount_reason.strip(),
                        values={"total": total, "discount": body.payment.discount, "service_fee": service_fee,
                                "change": max(0, change), **card_payment_audit(body.payment)})],
                    cmv=round(sum(i["qty"] * i.get("unit_cost", 0) for i in chosen), 2)).model_dump()
                receipt["parent_order_id"] = order["id"]
                receipt["partial_table_id"] = id
                await db.orders.insert_one(dict(receipt), session=session)
                result = await db.orders.update_one({"id": order["id"], "status": "aberto"},
                    {"$set": {"items": remaining, "subtotal": remaining_sub, "total": remaining_sub}}, session=session)
                if result.modified_count != 1:
                    raise HTTPException(409, "Comanda alterada. Refaça a divisão.")
                await db.tables.update_one({"id": id, "order_id": order["id"]},
                    {"$set": {"total": remaining_sub}, "$unset": {"split_request": ""}}, session=session)
                return {"order": receipt, "invoice": None}
    except PyMongoError as exc:
        raise HTTPException(503, "Pagamento parcial exige MongoDB com transações habilitadas; nenhuma cobrança foi registrada") from exc


@router.post("/tables/{id}/pay", response_model=SaleResult)
async def pay_table(id: str, body: TablePayIn, user: dict = Depends(require("caixa"))):
    return await with_order_transaction(lambda session: apply_pay_table(id, body, user, session=session))


async def apply_pay_table(id: str, body: TablePayIn, user: dict, *, session=None):
    options = {"session": session} if session is not None else {}
    t = await get_table(id, **options)
    if body.expected_order_id is not None and body.expected_order_id != t.get("order_id"):
        raise HTTPException(409, "A comanda mudou. Consulte a mesa antes de cobrar.")
    order = await db.orders.find_one({"id": t.get("order_id")}, {"_id": 0}, **options) if t.get("order_id") else None
    if not order:
        raise HTTPException(400, "Mesa sem comanda aberta")
    received = order.get("advance_paid", 0)
    if (received or body.expected_advance_paid is not None) and body.expected_advance_paid != received:
        raise HTTPException(409, "Recebimentos alterados. Atualize a conta antes de fechar.")
    if not body.payments and not received:
        raise HTTPException(400, "Informe uma forma de pagamento.")
    order, inv = await finalize_payment(order, body, actor=user, **options)
    return {"order": order, "invoice": inv}


class MonetaryReceiptIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["amount", "percentage"]
    value: Decimal = Field(gt=0, decimal_places=2, max_digits=10)
    expected_order_id: str = Field(min_length=1, max_length=128)
    expected_balance: Decimal = Field(gt=0, decimal_places=2, max_digits=10)
    client_ref: str = Field(min_length=6, max_length=128)
    payments: list[Payment] = Field(min_length=1, max_length=20)


async def monetary_order(table_id: str, order_id: str, *, session):
    table = await get_table(table_id, session=session)
    if table.get("order_id") != order_id:
        raise HTTPException(409, "Atendimento alterado. Atualize os valores.")
    order = await db.orders.find_one({"id": order_id, "status": "aberto"}, {"_id": 0}, session=session)
    if not order:
        raise HTTPException(409, "Conta encerrada. Consulte o histórico.")
    if order.get("stock_completion") == "pending" or any(
        not batch.get("complete") for batch in order.get("table_item_batches", {}).values()
    ):
        raise HTTPException(409, "Confira os envios pendentes antes de receber.")
    return order


async def write_monetary_adjustment(order, receipt, cash, user, kind, reason, *, session):
    totals = method_totals([receipt], with_brand=True)
    if kind == "table_receipt_reversal":
        totals = {method: -amount for method, amount in totals.items()}
    key = receipt["id"] + (":reversal" if kind == "table_receipt_reversal" else "")
    await db.cash_adjustments.insert_one({
        "_id": key, "id": key, "kind": kind, "cash_session_id": cash["id"],
        "source_cash_session_id": receipt["cash_session_id"], "order_id": order["id"],
        "table_id": order["table_id"],
        "operator_id": user["id"], "by_name": user["name"], "at": now(),
        "reason": reason, "totals_by_method": totals,
    }, session=session)


@router.post("/tables/{id}/monetary-receipts")
async def receive_monetary_partial(id: str, body: MonetaryReceiptIn, user: dict = Depends(require("caixa"))):
    # The order owns the receipt and the cash ledger owns a globally unique key.
    key = "table-receipt:" + hashlib.sha256(body.client_ref.encode()).hexdigest()
    payload = body.model_dump(mode="json", exclude={"client_ref", "value", "expected_balance"})
    fingerprint = hashlib.sha256(json.dumps(
        [id, cents(body.value), cents(body.expected_balance), payload], sort_keys=True).encode()).hexdigest()

    async def apply(session):
        require_receipt_transaction(session)
        previous = await db.cash_adjustments.find_one({"_id": key}, {"order_id": 1}, session=session)
        if previous:
            recorded = await db.orders.find_one({"id": previous["order_id"]},
                {"table_receipts": {"$elemMatch": {"id": key}}}, session=session)
            if not recorded or not recorded.get("table_receipts"):
                raise HTTPException(409, "Recebimento em conferência. Consulte o caixa.")
            receipt = recorded["table_receipts"][0]
            if receipt["operator_id"] != user["id"] or receipt["fingerprint"] != fingerprint:
                raise HTTPException(409, "Referência de recebimento já utilizada.")
            return {"id": key, "amount": receipt["amount"]}

        order = await monetary_order(id, body.expected_order_id, session=session)
        received = cents(order.get("advance_paid", 0))
        balance = cents(compute_subtotal(order)) - received
        if balance != cents(body.expected_balance):
            raise HTTPException(409, "Saldo alterado. Confira a conta e calcule a parcela novamente.")
        if body.mode == "percentage" and body.value >= 100:
            raise HTTPException(422, "Informe um percentual menor que 100% do saldo.")
        amount = cents(body.value) if body.mode == "amount" else int(
            (Decimal(balance) * body.value / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if not 0 < amount < balance:
            raise HTTPException(422, "A parcela deve ser positiva e menor que o saldo. Use o fechamento para quitar a conta.")
        if any(p.method == "fiado" for p in body.payments):
            raise HTTPException(422, "Fiado está disponível no fechamento da conta.")
        if any(cents(p.amount) / 100 != p.amount for p in body.payments) or sum(cents(p.amount) for p in body.payments) != amount:
            raise HTTPException(422, "A soma dos pagamentos deve ser igual à parcela em centavos.")
        if any(p.method in ("credito", "debito") and not p.brand for p in body.payments):
            raise HTTPException(422, "Informe a bandeira do cartão.")
        if any(p.method == "pix" and p.details is None for p in body.payments):
            raise HTTPException(422, "Informe a referência e confirme o recebimento do PIX.")
        payment = PayIn(payments=body.payments, emit_invoice=False)
        validate_payment_details(payment)
        await validate_methods([p.method for p in body.payments])
        payments = [p.model_dump() for p in body.payments]
        previous_pix = pix_references(
            p for entry in order.get("table_receipts", []) for p in entry["payments"])
        if previous_pix & pix_references(payments):
            raise HTTPException(409, "Referência PIX já registrada nesta conta.")

        cash = await current_cash(session=session, **cash_scope(user))
        if not cash:
            raise HTTPException(409, "Abra o caixa para receber a parcela.")
        await claim_cash(cash, session=session)
        receipt = {
            "id": key, "fingerprint": fingerprint, "operator_id": user["id"],
            "cash_session_id": cash["id"], "amount": amount / 100, "payments": payments,
            "mode": body.mode, "value": float(body.value), "at": now(), "by_name": user["name"],
        }
        await write_monetary_adjustment(order, receipt, cash, user, "table_receipt",
                                        f"Parcela do pedido #{order['number']}", session=session)
        await db.orders.update_one({"id": order["id"], "status": "aberto"},
            {"$set": {"advance_paid": (received + amount) / 100},
             "$push": {"table_receipts": receipt, "audit_events": audit_event(
                 "table_receipt_recorded", user, correlation=key, values={
                     "amount": amount / 100, "remaining": (balance - amount) / 100,
                     "mode": body.mode, **card_payment_audit(payment)})}}, session=session)
        await db.tables.update_one({"id": id, "order_id": order["id"]},
                                   {"$set": {"total": (balance - amount) / 100}}, session=session)
        return {"id": key, "amount": amount / 100}

    try:
        return await with_order_transaction(apply)
    except DuplicateKeyError as exc:
        raise HTTPException(409, "Recebimento concorrente. Consulte a conta e repita com a mesma referência.") from exc


class MonetaryReversalIn(BaseModel):
    expected_order_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=3, max_length=300)
    manager_pin: str | None = None


@router.post("/tables/{id}/monetary-receipts/{receipt_id}/reverse")
async def reverse_monetary_partial(id: str, receipt_id: str, body: MonetaryReversalIn, user: dict = Depends(require("caixa"))):
    authorized = await cancel_authorizer(user, body.manager_pin)
    reason = body.reason.strip()
    if len(reason) < 3:
        raise HTTPException(422, "Informe o motivo do estorno.")

    async def apply(session):
        require_receipt_transaction(session)
        prior = await db.cash_adjustments.find_one({"_id": receipt_id + ":reversal"}, session=session)
        if prior:
            if (prior.get("table_id") != id or prior["order_id"] != body.expected_order_id
                    or prior["operator_id"] != user["id"] or prior["reason"] != reason):
                raise HTTPException(409, "Recebimento já estornado.")
            return {"id": receipt_id, "amount": round(-sum(prior["totals_by_method"].values()), 2)}
        order = await monetary_order(id, body.expected_order_id, session=session)
        receipt = next((r for r in order.get("table_receipts", []) if r["id"] == receipt_id), None)
        if not receipt:
            raise HTTPException(404, "Recebimento não encontrado.")
        if receipt.get("reversed_at"):
            if receipt.get("reversal_reason") != reason or receipt.get("reversed_by_id") != user["id"]:
                raise HTTPException(409, "Recebimento já estornado.")
            return {"id": receipt_id, "amount": receipt["amount"]}
        cash = await current_cash(session=session, **cash_scope(user))
        if not cash:
            raise HTTPException(409, "Abra o caixa para registrar a devolução.")
        await claim_cash(cash, session=session)
        await write_monetary_adjustment(order, receipt, cash, user, "table_receipt_reversal",
                                        reason, session=session)
        received = cents(order["advance_paid"]) - cents(receipt["amount"])
        await db.orders.update_one({"id": order["id"], "table_receipts.id": receipt_id},
            {"$set": {"advance_paid": received / 100, "table_receipts.$.reversed_at": now(),
                      "table_receipts.$.reversal_reason": reason, "table_receipts.$.reversed_by_id": user["id"]},
             "$push": {"audit_events": audit_event("table_receipt_reversed", user, correlation=receipt_id,
                                                  authorized_by=authorized, reason=reason,
                                                  values={"amount": receipt["amount"]})}}, session=session)
        await db.tables.update_one({"id": id, "order_id": order["id"]},
            {"$set": {"total": (cents(compute_subtotal(order)) - received) / 100}}, session=session)
        return {"id": receipt_id, "amount": receipt["amount"]}

    return await with_order_transaction(apply)
