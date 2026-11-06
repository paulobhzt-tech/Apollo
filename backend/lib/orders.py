"""Order domain helpers shared by PDV, tables, delivery and public routers."""
import secrets
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


def product_cost(p: dict, ings: dict[str, dict]) -> float:
    """Manual cost price wins when set; otherwise the recipe (ficha técnica) cost."""
    manual = p.get("cost_price") or 0
    return round(manual, 2) if manual > 0 else recipe_cost(p.get("recipe", []), ings)


async def ingredient_map() -> dict[str, dict]:
    return {i["id"]: i for i in await db.ingredients.find({}, {"_id": 0}).to_list(5000)}


async def build_items(items_in: list[OrderItemIn]) -> list[OrderItem]:
    ids = list({i.product_id for i in items_in})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}, "active": True}, {"_id": 0}).to_list(500)}
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    ings = await ingredient_map()
    link_ids = list({c["product_id"] for p in prods.values() for g in p.get("options", []) for c in g["choices"] if c.get("product_id")})
    linked_map = {p["id"]: p for p in await db.products.find({"id": {"$in": link_ids}}, {"_id": 0}).to_list(500)} if link_ids else {}
    out: list[OrderItem] = []
    for it in items_in:
        p = prods.get(it.product_id)
        if not p:
            raise HTTPException(400, "Produto indisponível ou inexistente")
        groups = {g["name"]: g for g in p.get("options", [])}
        labels, extra, linked = [], 0.0, []
        for ch in it.options:
            g = groups.get(ch.group)
            c = next((c for c in g["choices"] if c["name"] == ch.name), None) if g else None
            if not c:
                raise HTTPException(400, f"Opção inválida: {ch.group} / {ch.name}")
            labels.append(f"{ch.group}: {ch.name}")
            extra += c["price"]
            if c.get("product_id"):
                linked.append(c["product_id"])
        for g in groups.values():
            n = sum(1 for ch in it.options if ch.group == g["name"])
            if g.get("required") and not n:
                raise HTTPException(400, f"Escolha {g['name']} para {p['name']}")
            if not g.get("multi") and n > 1:
                raise HTTPException(400, f"Escolha apenas uma opção em {g['name']}")
        out.append(OrderItem(
            product_id=p["id"], name=p["name"], qty=it.qty, unit_price=round(p["price"] + extra, 2), options=labels, option_products=linked,
            unit_cost=round(product_cost(p, ings) + sum(product_cost(linked_map[x], ings) for x in linked if x in linked_map), 2), notes=it.notes,
            station=p.get("station") or cats.get(p["category_id"], {}).get("station", "cozinha"), print_ticket=p.get("print_ticket", True),
        ))
    return out


async def move_stock(items: list[OrderItem], by_name: str, note: str, sign: int = -1) -> None:
    """sign=-1 consumes ingredients (sale), +1 returns them (cancel)."""
    ids = list({i.product_id for i in items} | {x for i in items for x in i.option_products})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "recipe": 1}).to_list(500)}
    agg: dict[str, float] = {}
    for it in items:
        for pid in [it.product_id, *it.option_products]:  # combo choices consume their own recipe
            for r in prods.get(pid, {}).get("recipe", []):
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
    if order.get("table_label"):
        return order["table_label"]
    if order.get("table_number"):
        return f"Mesa {order['table_number']}"
    if order["source"] == "pdv":
        return f"Balcão #{order['number']}"
    return f"{SOURCE_LABEL.get(order['source'], order['source'])} #{order['number']}"


async def create_ticket(order: dict, items: list[OrderItem]) -> None:
    t = KitchenTicket(
        order_id=order["id"], order_number=order["number"], label=ticket_label(order), source=order["source"],
        items=[KitchenItem(name=i.name, qty=i.qty, notes=i.notes, station=i.station, options=i.options, print_ticket=i.print_ticket) for i in items],
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
    key = f"35{dt:%y%m}12345678000190{model}001{number:09d}1{secrets.randbelow(9 * 10**7) + 10**7}"
    key += str(sum(int(c) for c in key) % 10)
    inv = Invoice(
        number=number, doc_type=doc_type, access_key=key, protocol=f"135{secrets.randbelow(9 * 10**11) + 10**11}",
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
    await validate_methods([p.method for p in pay.payments])
    if any(p.method in ("credito", "debito") and not p.brand for p in pay.payments):
        raise HTTPException(400, "Informe a bandeira do cartão (Visa, Mastercard ou Elo)")
    fiado = round(sum(p.amount for p in pay.payments if p.method == "fiado"), 2)
    cust = None
    if fiado:
        cust = await db.fiado_customers.find_one({"id": pay.fiado_customer_id}, {"_id": 0}) if pay.fiado_customer_id else None
        if not cust:
            raise HTTPException(400, "Selecione o cliente da conta fiado")
        if cust["credit_limit"] > 0 and cust["balance"] + fiado > cust["credit_limit"] + 0.009:
            raise HTTPException(400, f"Limite de crédito de {cust['name']} excedido (saldo {cust['balance']:.2f} / limite {cust['credit_limit']:.2f})")
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
    if cust:
        upd["fiado_customer_id"] = cust["id"]
        await adjust_balance(cust["id"], fiado)
        from models.schemas import CustomerMove
        await db.customer_moves.insert_one(CustomerMove(customer_id=cust["id"], type="compra", amount=fiado,
                                                        order_number=order["number"], note="Venda no fiado").model_dump())
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
        "order_id": None, "opened_at": None, "call": "", "total": 0, "customers": [],
    }, "$unset": {"split_request": ""}})


async def new_order(**fields) -> dict:
    from models.schemas import Order
    order = Order(number=await next_seq("order"), **fields).model_dump()
    await db.orders.insert_one(dict(order))
    return order


def pay_key(p: dict) -> str:
    return f"{p['method']}:{p['brand']}" if p.get("brand") else p["method"]


def method_totals(orders: list[dict], with_brand: bool = False) -> dict[str, float]:
    """Net received per payment method (minus change and refunds)."""
    out: dict[str, float] = {}
    key = pay_key if with_brand else (lambda p: p["method"])
    for o in orders:
        for p in o.get("payments", []):
            out[key(p)] = out.get(key(p), 0) + p["amount"]
        if o.get("change"):
            out["dinheiro"] = out.get("dinheiro", 0) - o["change"]
        for r in o.get("refunds", []):
            k = key(r)
            out[k] = out.get(k, 0) - r["amount"]
    return {k: round(v, 2) for k, v in out.items()}


async def fiado_reverse(order: dict, amount: float, by_name: str, note: str) -> None:
    """Give back store credit when a fiado sale (or part of it) is refunded."""
    if not order.get("fiado_customer_id") or amount <= 0:
        return
    from models.schemas import CustomerMove
    await adjust_balance(order["fiado_customer_id"], -amount)
    await db.customer_moves.insert_one(CustomerMove(customer_id=order["fiado_customer_id"], type="estorno", amount=round(amount, 2),
                                                    order_number=order["number"], note=note, by_name=by_name).model_dump())


async def card_fee_table() -> dict[str, float]:
    """Fees by "credito:visa"-style key plus custom payment methods by their own key."""
    fees = dict((await db.settings.find_one({"_id": "card_fees"}) or {}).get("fees", {}))
    for m in await db.payment_methods.find({"builtin": False, "fee_pct": {"$gt": 0}}, {"_id": 0, "key": 1, "fee_pct": 1}).to_list(100):
        fees[m["key"]] = m["fee_pct"]
    return fees


async def validate_methods(methods: list[str]) -> None:
    """Rejects disabled or unknown payment methods (configured in Financeiro → Formas de pagamento)."""
    cfg = {m["key"]: m for m in await db.payment_methods.find({}, {"_id": 0, "key": 1, "active": 1, "name": 1}).to_list(200)}
    for k in set(methods):
        if k in ("voucher", "online") and k not in cfg:
            continue
        m = cfg.get(k)
        if m is None and k in ("dinheiro", "credito", "debito", "pix", "fiado"):
            continue  # builtin not configured yet
        if m is None:
            raise HTTPException(400, f"Forma de pagamento desconhecida: {k}")
        if not m.get("active", True):
            raise HTTPException(400, f"Forma de pagamento desativada: {m['name']}")


async def adjust_balance(customer_id: str, delta: float) -> None:
    """Atomic $inc, then normalise to cents so float noise never reaches the UI."""
    c = await db.fiado_customers.find_one_and_update({"id": customer_id}, {"$inc": {"balance": round(delta, 2)}}, return_document=True)
    if c:
        await db.fiado_customers.update_one({"id": customer_id}, {"$set": {"balance": round(c["balance"], 2)}})
