from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import cancel_authorizer, current_user, require
from lib.db import client, db
from lib.orders import (build_items, create_ticket, current_cash, finalize_payment, free_table, move_stock, new_order, next_seq, now, validate_methods,
                        refresh_totals)
from models.schemas import (AddItemsIn, CancelIn, OkOut, OpenTableIn, Order, OrderItem, PayIn, SaleResult, Table, TableIn,
                            TableStatusIn, TableUpdate, TransferIn, table_label)

router = APIRouter()
STAFF = ("caixa", "garcom")


async def get_table(id: str) -> dict:
    t = await db.tables.find_one({"id": id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Mesa não encontrada")
    return t


async def get_or_open_order(table: dict, waiter: dict | None = None, source: str = "mesa") -> dict:
    """Return the table's open order, opening the table if it is free."""
    if table.get("order_id"):
        o = await db.orders.find_one({"id": table["order_id"], "status": "aberto"}, {"_id": 0})
        if o:
            return o
    order = await new_order(channel="mesa", source=source, table_id=table["id"], table_number=table["number"],
                            table_label=table_label(table),
                            waiter_id=waiter["id"] if waiter else None, waiter_name=waiter["name"] if waiter else "")
    await db.tables.update_one({"id": table["id"]}, {"$set": {
        "status": "ocupada", "order_id": order["id"], "opened_at": now(), "people": table.get("people") or 1,
        "waiter_id": order["waiter_id"], "waiter_name": order["waiter_name"]}})
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
    t = await get_table(id)
    if t.get("order_id"):
        raise HTTPException(400, "Mesa já está aberta")
    await db.tables.update_one({"id": id}, {"$set": {"people": body.people, "customer_name": body.customer_name}})
    await get_or_open_order({**t, "people": body.people}, user)
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
    t = await get_table(id)
    if t.get("order_id"):
        o = await db.orders.find_one({"id": t["order_id"]}, {"_id": 0, "items": 1, "status": 1})
        if o and o["status"] == "aberto":
            if any(not i.get("cancelled") for i in o["items"]):
                raise HTTPException(400, "Há itens na comanda: feche a conta ou cancele a mesa")
            await db.orders.update_one({"id": t["order_id"]}, {"$set": {"status": "cancelado", "cancel_reason": "Liberada sem consumo",
                                                                        "cancelled_by": user["name"], "cancelled_at": now()}})
            await db.kitchen_tickets.update_many({"order_id": t["order_id"]}, {"$set": {"status": "entregue"}})
    await free_table(id)
    return await get_table(id)


@router.post("/tables/{id}/cancel", response_model=Table)
async def cancel_table(id: str, body: CancelIn, user: dict = Depends(current_user)):
    """Cancels the whole open order of a table/comanda (stock returned, tickets closed) and frees it. Needs cancel permission or a manager PIN."""
    from routers.operations import cancel_order
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Mesa sem comanda aberta")
    await cancel_order(t["order_id"], body, user)
    await free_table(id)
    return await get_table(id)


@router.post("/tables/{id}/clear-call", response_model=Table)
async def clear_call(id: str, _: dict = Depends(require(*STAFF))):
    await get_table(id)
    await db.tables.update_one({"id": id}, {"$set": {"call": ""}})
    return await get_table(id)


@router.get("/tables/{id}/order", response_model=Order | None)
async def table_order(id: str, _: dict = Depends(current_user)):
    t = await get_table(id)
    if not t.get("order_id"):
        return None
    return await db.orders.find_one({"id": t["order_id"]}, {"_id": 0})


@router.post("/tables/{id}/items", response_model=Order)
async def add_items(id: str, body: AddItemsIn, user: dict = Depends(require(*STAFF))):
    t = await get_table(id)
    items = await build_items(body.items)
    order = await get_or_open_order(t, user)
    result = await db.orders.update_one(
        {"id": order["id"], "status": "aberto"},
        {"$push": {"items": {"$each": [i.model_dump() for i in items]}}},
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Comanda foi fechada ou alterada. Atualize a mesa antes de lançar itens.")
    await create_ticket(order, items)
    await move_stock(items, user["name"], f"{table_label(t)} · Pedido #{order['number']}")
    return await refresh_totals(order["id"])


@router.post("/tables/{id}/items/{item_id}/cancel", response_model=Order)
async def cancel_item(id: str, item_id: str, body: CancelIn, user: dict = Depends(current_user)):
    t = await get_table(id)
    order = await db.orders.find_one({"id": t.get("order_id"), "status": "aberto"}, {"_id": 0})
    if not order:
        raise HTTPException(400, "Mesa sem comanda aberta")
    item = next((i for i in order["items"] if i["id"] == item_id and not i.get("cancelled")), None)
    if not item:
        raise HTTPException(404, "Item não encontrado")
    auth = await cancel_authorizer(user, body.manager_pin)
    reason = body.reason if auth == user["name"] else f"{body.reason} (autorizado por {auth})"
    from models.schemas import OrderItem
    qty = body.qty if body.qty and body.qty < item["qty"] else item["qty"]
    if qty < item["qty"]:  # partial: keep the rest, record the removed units as a cancelled line
        removed = OrderItem(**{**item, "id": OrderItem.model_fields["id"].default_factory(), "qty": qty, "cancelled": True, "cancel_reason": reason})
        await db.orders.update_one({"id": order["id"], "items.id": item_id}, {"$set": {"items.$.qty": item["qty"] - qty}})
        await db.orders.update_one({"id": order["id"]}, {"$push": {"items": removed.model_dump()}})
    else:
        await db.orders.update_one({"id": order["id"], "items.id": item_id},
                                   {"$set": {"items.$.cancelled": True, "items.$.cancel_reason": reason}})
    await move_stock([OrderItem(**{**item, "qty": qty})], user["name"], f"Cancelamento: {body.reason}", sign=1)
    return await refresh_totals(order["id"])


@router.post("/tables/{id}/transfer", response_model=Table)
async def transfer(id: str, body: TransferIn, _: dict = Depends(require(*STAFF))):
    if id == body.target_table_id:
        raise HTTPException(400, "Selecione uma mesa de destino diferente da origem")
    src = await get_table(id)
    dst = await get_table(body.target_table_id)
    if not src.get("order_id"):
        raise HTTPException(400, "Mesa de origem sem comanda")
    if dst.get("order_id") or dst["status"] != "livre":
        raise HTTPException(400, "Mesa de destino precisa estar livre e não reservada")
    await db.orders.update_one({"id": src["order_id"]}, {"$set": {"table_id": dst["id"], "table_number": dst["number"], "table_label": table_label(dst)}})
    keep = {k: src[k] for k in ("status", "customer_name", "people", "waiter_id", "waiter_name", "order_id", "opened_at", "total")}
    await db.tables.update_one({"id": dst["id"]}, {"$set": keep})
    await free_table(src["id"])
    return await get_table(dst["id"])


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


class PartialBillIn(BaseModel):
    """Item quantities to include in a separate bill preview."""
    quantities: dict[str, int] = Field(min_length=1)


@router.post("/tables/{id}/partial-bill/preview")
async def preview_partial_bill(id: str, body: PartialBillIn, _: dict = Depends(require("caixa"))):
    """Read-only preview. Does not receive money, alter stock or close the table."""
    t = await get_table(id)
    if not t.get("order_id"):
        raise HTTPException(400, "Mesa sem comanda aberta")
    order = await db.orders.find_one({"id": t["order_id"], "status": "aberto"}, {"_id": 0})
    if not order:
        raise HTTPException(400, "Comanda não está aberta")
    available = {i["id"]: i for i in order["items"] if not i.get("cancelled")}
    chosen = []
    for item_id, qty in body.quantities.items():
        item = available.get(item_id)
        if not item:
            raise HTTPException(400, f"Item indisponível: {item_id}")
        if isinstance(qty, bool) or qty <= 0 or qty > item["qty"]:
            raise HTTPException(400, f"Quantidade inválida para {item['name']}")
        chosen.append({"item_id": item_id, "name": item["name"], "qty": qty,
                       "unit_price": item["unit_price"], "total": round(qty * item["unit_price"], 2)})
    subtotal = round(sum(i["total"] for i in chosen), 2)
    remaining = round(sum(i["qty"] * i["unit_price"] for i in available.values()) - subtotal, 2)
    return {"table_id": id, "order_id": order["id"], "items": chosen,
            "subtotal": subtotal, "remaining_subtotal": remaining,
            "message": "Prévia apenas: nenhum pagamento foi registrado"}


class PartialPaymentIn(PartialBillIn):
    payment: PayIn
    client_ref: str = Field(min_length=6, max_length=120)


@router.post("/tables/{id}/partial-bill/pay", response_model=SaleResult)
async def pay_partial_bill(id: str, body: PartialPaymentIn, _: dict = Depends(require("caixa"))):
    """Atomically move selected units to a separate paid order; never deduct stock twice.

    Requires MongoDB replica-set transactions. Standalone databases fail closed.
    """
    if body.payment.emit_invoice:
        raise HTTPException(400, "Emissão fiscal parcial ainda não habilitada. Use comprovante não fiscal.")
    if body.payment.fiado_customer_id or any(p.method == "fiado" for p in body.payment.payments):
        raise HTTPException(400, "Fiado não está habilitado no pagamento parcial")
    await validate_methods([p.method for p in body.payment.payments])
    if any(p.method in ("credito", "debito") and not p.brand for p in body.payment.payments):
        raise HTTPException(400, "Informe a bandeira do cartão")
    cash = await current_cash()
    if not cash:
        raise HTTPException(400, "Abra o caixa para receber pagamentos")
    # Allocate the sequence before the transaction: a skipped number is preferable
    # to a non-transactional counter update inside a financial transaction.
    number = await next_seq("order")
    from pymongo.errors import PyMongoError
    try:
        async with await client.start_session() as session:
            async with session.start_transaction():
                previous = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0}, session=session)
                if previous:
                    return {"order": previous, "invoice": None}
                table = await db.tables.find_one({"id": id}, session=session)
                if not table or not table.get("order_id"):
                    raise HTTPException(400, "Mesa sem comanda aberta")
                order = await db.orders.find_one({"id": table["order_id"], "status": "aberto"}, session=session)
                if not order:
                    raise HTTPException(409, "Comanda foi alterada ou fechada")
                chosen = []
                remaining = []
                for item in order["items"]:
                    qty = body.quantities.get(item["id"], 0)
                    if isinstance(qty, bool) or qty < 0 or qty > (0 if item.get("cancelled") else item["qty"]):
                        raise HTTPException(400, f"Quantidade inválida: {item['name']}")
                    if qty:
                        chosen.append({**item, "qty": qty})
                    if item["qty"] > qty:
                        remaining.append({**item, "qty": item["qty"] - qty})
                if not chosen or any(k not in {i["id"] for i in order["items"]} for k in body.quantities):
                    raise HTTPException(400, "Selecione itens válidos")
                subtotal = round(sum(i["qty"] * i["unit_price"] for i in chosen), 2)
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
                    subtotal=subtotal, discount=body.payment.discount, service_fee=service_fee,
                    total=total, payments=body.payment.payments,
                    change=max(0, change), paid_at=now(), cash_session_id=cash["id"],
                    client_ref=body.client_ref, waiter_id=order.get("waiter_id"),
                    waiter_name=order.get("waiter_name", ""),
                    cmv=round(sum(i["qty"] * i.get("unit_cost", 0) for i in chosen), 2)).model_dump()
                receipt["parent_order_id"] = order["id"]
                await db.orders.insert_one(dict(receipt), session=session)
                remaining_sub = round(sum(i["qty"] * i["unit_price"] for i in remaining if not i.get("cancelled")), 2)
                result = await db.orders.update_one({"id": order["id"], "status": "aberto"},
                    {"$set": {"items": remaining, "subtotal": remaining_sub, "total": remaining_sub}}, session=session)
                if result.modified_count != 1:
                    raise HTTPException(409, "Comanda alterada. Refaça a divisão.")
                await db.tables.update_one({"id": id, "order_id": order["id"]},
                    {"$set": {"total": remaining_sub}}, session=session)
                return {"order": receipt, "invoice": None}
    except PyMongoError as exc:
        raise HTTPException(503, "Pagamento parcial exige MongoDB com transações habilitadas; nenhuma cobrança foi registrada") from exc


@router.post("/tables/{id}/pay", response_model=SaleResult)
async def pay_table(id: str, body: PayIn, _: dict = Depends(require("caixa"))):
    t = await get_table(id)
    order = await db.orders.find_one({"id": t.get("order_id")}, {"_id": 0}) if t.get("order_id") else None
    if not order:
        raise HTTPException(400, "Mesa sem comanda aberta")
    order, inv = await finalize_payment(order, body)
    return {"order": order, "invoice": inv}
