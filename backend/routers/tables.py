from fastapi import APIRouter, Depends, HTTPException

from lib.auth import cancel_authorizer, current_user, require
from lib.db import db
from lib.orders import (build_items, create_ticket, finalize_payment, free_table, move_stock, new_order, now,
                        refresh_totals)
from models.schemas import (AddItemsIn, CancelIn, OkOut, OpenTableIn, Order, PayIn, SaleResult, Table, TableIn,
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
    await db.orders.update_one({"id": order["id"]}, {"$push": {"items": {"$each": [i.model_dump() for i in items]}}})
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


@router.post("/tables/{id}/pay", response_model=SaleResult)
async def pay_table(id: str, body: PayIn, _: dict = Depends(require("caixa"))):
    t = await get_table(id)
    order = await db.orders.find_one({"id": t.get("order_id")}, {"_id": 0}) if t.get("order_id") else None
    if not order:
        raise HTTPException(400, "Mesa sem comanda aberta")
    order, inv = await finalize_payment(order, body)
    return {"order": order, "invoice": inv}
