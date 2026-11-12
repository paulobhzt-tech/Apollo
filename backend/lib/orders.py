"""Order domain helpers shared by PDV, tables, delivery and public routers."""
import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from uuid import uuid4

from fastapi import HTTPException
from pymongo import ReturnDocument

from lib.audit import audit_event
from lib.db import db
from models.schemas import Invoice, InvoiceItem, KitchenItem, KitchenTicket, OrderItem, OrderItemIn, PayIn, PRODUCT_CHANNELS, ProductChannel, StockMove

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


def _session_args(session):
    return {"session": session} if session is not None else {}


async def next_seq(name: str, *, session=None) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER, **_session_args(session)
    )
    return int(doc["seq"])


def recipe_cost(recipe: list[dict], ings: dict[str, dict]) -> float:
    return round(sum(ings[r["ingredient_id"]]["cost_per_unit"] * r["qty"] for r in recipe if r["ingredient_id"] in ings), 2)


def stock_recipe(product: dict) -> list[dict]:
    stock_item = product.get("stock_ingredient_id")
    return [{"ingredient_id": stock_item, "qty": 1}] if stock_item else product.get("recipe", [])


def product_cost(p: dict, ings: dict[str, dict]) -> float:
    """Manual cost price wins when set; otherwise the recipe (ficha técnica) cost."""
    manual = p.get("cost_price") or 0
    return round(manual, 2) if manual > 0 else recipe_cost(stock_recipe(p), ings)


async def ingredient_map(*, session=None) -> dict[str, dict]:
    return {i["id"]: i for i in await db.ingredients.find({}, {"_id": 0}, **_session_args(session)).to_list(5000)}


async def build_items(items_in: list[OrderItemIn], *, channel: ProductChannel | None = None) -> list[OrderItem]:
    ids = list({i.product_id for i in items_in})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}, "active": True}, {"_id": 0}).to_list(500)}
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    ings = await ingredient_map()
    link_ids = list({c["product_id"] for p in prods.values() for g in p.get("options", []) for c in g["choices"] if c.get("product_id")})
    linked_map = {p["id"]: p for p in await db.products.find({"id": {"$in": link_ids}}, {"_id": 0}).to_list(500)} if link_ids else {}
    out: list[OrderItem] = []
    stock_ref = uuid4().hex
    for it in items_in:
        p = prods.get(it.product_id)
        if not p or (channel is not None and channel not in p.get("channels", PRODUCT_CHANNELS)):
            raise HTTPException(400, "Produto indisponível neste canal ou inexistente")
        sale_unit = p.get("sale_unit", "un")
        if sale_unit == "un" and it.qty != int(it.qty):
            raise HTTPException(400, f"{p['name']} aceita somente unidades inteiras")
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
            product_id=p["id"], name=p["name"], qty=it.qty, sale_unit=sale_unit, stock_ref=stock_ref,
            stock_recipe=[entry for pid in [p["id"], *linked]
                          for entry in stock_recipe(p if pid == p["id"] else linked_map.get(pid, {}))],
            unit_price=round(p["price"] + extra, 2), options=labels, option_products=linked,
            unit_cost=round(product_cost(p, ings) + sum(product_cost(linked_map[x], ings) for x in linked if x in linked_map), 2), notes=it.notes,
            station=p.get("station") or cats.get(p["category_id"], {}).get("station", "cozinha"), print_ticket=p.get("print_ticket", True),
        ))
    return out


def fefo_usable_lots(lots: list[dict], today: str) -> list[dict]:
    """Return non-expired lots ordered by earliest expiry, then purchase time."""
    return sorted(
        [p for p in lots if not p.get("expiry_date") or p["expiry_date"] >= today],
        key=lambda p: (p.get("expiry_date") or "9999-12-31", p["created_at"]),
    )


async def allocate_lots_fefo(ingredient_id: str, qty: float, note: str, by_name: str, stock_ref: str | None = None, *, session=None) -> None:
    """Consume dated purchase lots in earliest-expiry-first order.

    Legacy inventory without lots is left unallocated. Expired lots are never
    consumed; when tracked stock exists but usable stock is insufficient,
    fail closed rather than consuming expired inventory.
    """
    lots = await db.purchases.find(
        {"ingredient_id": ingredient_id, "remaining_qty": {"$gt": 0}},
        {"_id": 0}, **_session_args(session)).to_list(5001)
    if len(lots) > 5000:
        raise HTTPException(409, "Limite de lotes para conferência FEFO excedido")
    if not lots:
        return
    today = local_today()
    usable = fefo_usable_lots(lots, today)
    # Legacy stock may have existed before lot tracking was introduced.
    ing = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0, "stock": 1}, **_session_args(session))
    legacy_qty = max(0, round(float(ing.get("stock", 0)) - sum(float(p["remaining_qty"]) for p in lots), 4))
    if sum(float(p["remaining_qty"]) for p in usable) + legacy_qty + 0.00001 < qty:
        raise HTTPException(409, "Estoque disponível insuficiente: lote vencido ou quantidade indisponível")
    remaining = qty
    for p in usable:
        if remaining <= 0.00001:
            break
        take = min(remaining, float(p["remaining_qty"]))
        result = await db.purchases.update_one(
            {"id": p["id"], "remaining_qty": {"$gte": take}},
            {"$inc": {"remaining_qty": -take}}, **_session_args(session))
        if not result.modified_count:
            raise HTTPException(409, "Lote alterado por outra operação. Tente novamente")
        await db.lot_consumptions.insert_one({
            "ingredient_id": ingredient_id, "purchase_id": p["id"],
            "lot_number": p.get("lot_number", ""), "qty": take,
            "note": note, "stock_ref": stock_ref, "restored_qty": 0, "by_name": by_name, "created_at": now()}, **_session_args(session))
        remaining = round(remaining - take, 4)


async def restore_lots(ingredient_id: str, qty: float, note: str, by_name: str, stock_ref: str | None = None, *, historical_order_id: str | None = None, session=None) -> None:
    """Restore quantities to the original lots, using the sale's audit trail.

    Prefer the original batch reference. A legacy reversal uses a reviewed
    order association when the caller supplies the order identity.
    """
    if stock_ref:
        reference = {"stock_ref": stock_ref}
    elif historical_order_id:
        reference = {"historical_order_id": historical_order_id, "stock_ref": {"$in": [None, ""]}}
    else:
        reference = {"note": note}
    records = await db.lot_consumptions.find(
        {"ingredient_id": ingredient_id, **reference},
        {}, **_session_args(session)).sort("created_at", -1).to_list(5000)
    remaining = qty
    for record in records:
        if remaining <= 0.00001:
            break
        available = round(float(record["qty"]) - float(record.get("restored_qty", 0)), 4)
        take = min(remaining, available)
        if take <= 0:
            continue
        result = await db.lot_consumptions.update_one(
            {"_id": record["_id"], "restored_qty": record.get("restored_qty", {"$exists": False})},
            {"$inc": {"restored_qty": take}, "$set": {"restored_at": now(), "restored_by": by_name}}, **_session_args(session))
        if result.modified_count:
            await db.purchases.update_one(
                {"id": record["purchase_id"]},
                {"$inc": {"remaining_qty": take}}, **_session_args(session))
            remaining = round(remaining - take, 4)


async def move_stock(items: list[OrderItem], by_name: str, note: str, sign: int = -1, *, historical_order_id: str | None = None, session=None) -> None:
    """Consume or return recipe ingredients for sold/cancelled items.

    Aggregate all quantities before writing, and use Decimal to avoid floating
    point drift across combo products and repeated recipe components.
    """
    from decimal import Decimal, ROUND_HALF_UP

    ids = list({i.product_id for i in items} | {x for i in items for x in i.option_products})
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "recipe": 1, "stock_ingredient_id": 1}, **_session_args(session)).to_list(500)}
    agg: dict[tuple[str, str | None], Decimal] = {}
    for it in items:
        if it.cancelled:
            continue
        recipes = ([recipe.model_dump() for recipe in it.stock_recipe] if it.stock_recipe is not None
                   else [recipe for pid in [it.product_id, *it.option_products]
                         for recipe in prods.get(pid, {}).get("recipe", [])])
        for recipe in recipes:
            ingredient_id = recipe["ingredient_id"]
            consumed = Decimal(str(recipe["qty"])) * Decimal(str(it.qty))
            key = (ingredient_id, it.stock_ref)
            agg[key] = agg.get(key, Decimal(0)) + consumed
    if not agg:
        return
    ings = await ingredient_map(**_session_args(session))
    moves = []
    for (ing_id, stock_ref), amount in agg.items():
        if ing_id not in ings:
            continue
        delta = float((Decimal(sign) * amount).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
        if not delta:
            continue
        if sign < 0:
            await allocate_lots_fefo(ing_id, abs(delta), note, by_name, stock_ref, **_session_args(session))
        else:
            await restore_lots(ing_id, abs(delta), note, by_name, stock_ref,
                               historical_order_id=historical_order_id, **_session_args(session))
        result = await db.ingredients.update_one(
            {"id": ing_id, **({"$or": [{"stock": {"$gte": abs(delta)}}, {"block_negative_stock": False}]} if sign < 0 else {})},
            {"$inc": {"stock": delta}, "$set": {"updated_at": now()}}, **_session_args(session),
        )
        if sign < 0 and not result.modified_count:
            from fastapi import HTTPException
            raise HTTPException(409, "Estoque insuficiente para a venda")
        moves.append(StockMove(
            ingredient_id=ing_id, ingredient_name=ings[ing_id]["name"],
            type="venda" if sign < 0 else "estorno", qty=delta,
            note=note, by_name=by_name,
        ).model_dump())
    if moves:
        await db.stock_moves.insert_many(moves, **_session_args(session))


def ticket_label(order: dict) -> str:
    if order.get("table_label"):
        return order["table_label"]
    if order.get("table_number"):
        return f"Mesa {order['table_number']}"
    if order["source"] == "pdv":
        return f"Balcão #{order['number']}"
    return f"{SOURCE_LABEL.get(order['source'], order['source'])} #{order['number']}"


async def create_ticket(order: dict, items: list[OrderItem], *, session=None) -> None:
    """Create an independent production ticket per station.

    Each environment can advance its own ticket without accidentally marking
    products from another environment ready or delivered.
    """
    by_station: dict[str, list[KitchenItem]] = {}
    for item in items:
        station = item.station or "cozinha"
        by_station.setdefault(station, []).append(
            KitchenItem(name=item.name, qty=item.qty, notes=item.notes,
                        station=station, options=item.options,
                        print_ticket=item.print_ticket,
                        customer_name=item.customer_name)
        )
    if not by_station:
        return
    tickets = [
        KitchenTicket(
            order_id=order["id"], order_number=order["number"],
            label=ticket_label(order), source=order["source"],
            items=station_items,
        ).model_dump()
        for station_items in by_station.values()
    ]
    await db.kitchen_tickets.insert_many(tickets, **_session_args(session))


def compute_subtotal(order: dict) -> float:
    return round(sum(i["qty"] * i["unit_price"] for i in order["items"] if not i.get("cancelled")), 2)


async def refresh_totals(order_id: str, *, session=None) -> dict:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0}, **_session_args(session))
    sub = compute_subtotal(order)
    total = round(sub - order.get("discount", 0) + order.get("service_fee", 0) + order.get("delivery_fee", 0), 2)
    await db.orders.update_one({"id": order_id}, {"$set": {"subtotal": sub, "total": total}}, **_session_args(session))
    if order.get("table_id"):
        await db.tables.update_one({"id": order["table_id"]}, {"$set": {"total": total}}, **_session_args(session))
    order.update(subtotal=sub, total=total)
    return order


async def current_cash(*, session=None) -> dict | None:
    return await db.cash_sessions.find_one({"status": "aberto"}, {"_id": 0}, **_session_args(session))


async def emit_invoice(order: dict, doc_type: str = "nfce", cpf: str = "", *, session=None) -> dict:
    """MOCK: generates a fake SEFAZ-authorised NFC-e/NF-e. No real fiscal transmission."""
    number = await next_seq(f"invoice_{doc_type}", **_session_args(session))
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
    await db.invoices.insert_one(dict(inv), **_session_args(session))
    await db.orders.update_one({"id": order["id"]}, {"$set": {"invoice_id": inv["id"]}}, **_session_args(session))
    return inv


def validate_payment_details(pay: PayIn) -> None:
    references = set()
    for payment in pay.payments:
        if payment.method != "pix" or payment.details is None:
            continue
        details = payment.details
        reference = details.reference.strip().casefold()
        if not details.pix_received or not reference:
            raise HTTPException(400, "Confirme o recebimento e informe a referência do PIX manual")
        if reference in references:
            raise HTTPException(400, "Referência PIX repetida neste pagamento")
        references.add(reference)


async def finalize_payment(order: dict, pay: PayIn, actor: dict | None = None, *, session=None) -> tuple[dict, dict | None]:
    if order["status"] != "aberto":
        raise HTTPException(400, "Este pedido já foi fechado")
    cash = await current_cash(**_session_args(session))
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
    validate_payment_details(pay)
    await validate_methods([p.method for p in pay.payments])
    if any(p.method in ("credito", "debito") and not p.brand for p in pay.payments):
        raise HTTPException(400, "Informe a bandeira do cartão (Visa, Mastercard ou Elo)")
    fiado = round(sum(p.amount for p in pay.payments if p.method == "fiado"), 2)
    cust = None
    if fiado:
        cust = await db.fiado_customers.find_one({"id": pay.fiado_customer_id}, {"_id": 0}, **_session_args(session)) if pay.fiado_customer_id else None
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
    result = await db.orders.update_one(
        {"id": order["id"], "status": "aberto", "items": order["items"]},
        {"$set": upd, "$push": {"audit_events": audit_event(
            "payment_recorded", actor or {}, correlation=order.get("client_ref") or "",
            reason=pay.discount_reason.strip(),
            values={**{k: upd[k] for k in ("total", "discount", "service_fee", "change")},
                    "payment_methods": [payment.method for payment in pay.payments]},
        )}}, **_session_args(session),
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Pedido alterado ou já pago. Confira o histórico antes de tentar novamente.")
    if cust:
        await adjust_balance(cust["id"], fiado, **_session_args(session))
        from models.schemas import CustomerMove
        await db.customer_moves.insert_one(CustomerMove(customer_id=cust["id"], type="compra", amount=fiado,
                                                        order_number=order["number"], note="Venda no fiado").model_dump(), **_session_args(session))
    if order.get("table_id"):
        await free_table(order["table_id"], expected_order_id=order["id"], **_session_args(session))
    order = await db.orders.find_one({"id": order["id"]}, {"_id": 0}, **_session_args(session))
    inv = await emit_invoice(order, pay.doc_type, pay.customer_cpf, **_session_args(session)) if pay.emit_invoice else None
    if inv:
        order["invoice_id"] = inv["id"]
    return order, inv


async def free_table(table_id: str, expected_order_id: str | None = None, *, session=None) -> None:
    query = {"id": table_id}
    if expected_order_id is not None:
        query["order_id"] = expected_order_id
    await db.tables.update_one(query, {"$set": {
        "status": "livre", "customer_name": "", "people": 0, "waiter_id": None, "waiter_name": "",
        "order_id": None, "opened_at": None, "call": "", "total": 0, "customers": [],
    }, "$unset": {"split_request": ""}}, **_session_args(session))


async def new_order(*, session=None, **fields) -> dict:
    from models.schemas import Order
    order = Order(number=await next_seq("order", **_session_args(session)), **fields).model_dump()
    await db.orders.insert_one(dict(order), **_session_args(session))
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


async def fiado_reverse(order: dict, amount: float, by_name: str, note: str, *, session=None) -> None:
    """Give back store credit when a fiado sale (or part of it) is refunded."""
    if not order.get("fiado_customer_id") or amount <= 0:
        return
    from models.schemas import CustomerMove
    await adjust_balance(order["fiado_customer_id"], -amount, **_session_args(session))
    await db.customer_moves.insert_one(CustomerMove(customer_id=order["fiado_customer_id"], type="estorno", amount=round(amount, 2),
                                                    order_number=order["number"], note=note, by_name=by_name).model_dump(), **_session_args(session))


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


async def adjust_balance(customer_id: str, delta: float, *, session=None) -> None:
    """Update and round in one write so concurrent operations cannot lose credit."""
    await db.fiado_customers.update_one(
        {"id": customer_id},
        [{"$set": {"balance": {"$round": [{"$add": [{"$ifNull": ["$balance", 0]}, round(delta, 2)]}, 2]}}}],
        **_session_args(session),
    )
