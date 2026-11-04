from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require
from lib.db import db
from lib.orders import TAX_RATE, TZ, card_fee_table, current_cash, day_bounds, local_today, method_totals
from models.schemas import CardFees, Dashboard, Dre, Expense, ExpenseIn, OkOut, OptionRank

router = APIRouter()
PAY_LABEL = {"dinheiro": "Dinheiro", "credito": "Crédito", "debito": "Débito", "pix": "PIX", "voucher": "Voucher",
             "fiado": "Fiado", "online": "Online (App)"}
SRC_LABEL = {"pdv": "Balcão", "mesa": "Mesas", "cardapio": "QR Mesa", "ifood": "iFood", "99food": "99Food",
             "keeta": "Keeta", "site": "Site Próprio"}


def nv(d: dict, labels: dict | None = None) -> list[dict]:
    return [{"name": (labels or {}).get(k, k), "value": round(v, 2)} for k, v in sorted(d.items(), key=lambda x: -x[1])]


def top_products(orders: list[dict], n: int = 8) -> list[dict]:
    agg: dict[str, dict] = {}
    for o in orders:
        for i in o["items"]:
            if i.get("cancelled"):
                continue
            a = agg.setdefault(i["name"], {"name": i["name"], "qty": 0, "revenue": 0.0})
            a["qty"] += i["qty"]
            a["revenue"] = round(a["revenue"] + i["qty"] * i["unit_price"], 2)
    return sorted(agg.values(), key=lambda x: -x["revenue"])[:n]


def payment_totals(orders: list[dict]) -> dict[str, float]:
    return method_totals(orders)


async def paid_between(start: datetime, end: datetime) -> list[dict]:
    return await db.orders.find({"status": "pago", "paid_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(50000)


@router.get("/reports/dashboard", response_model=Dashboard)
async def dashboard(_: dict = Depends(require("caixa"))):
    today = local_today()
    start, end = day_bounds(today)
    orders = await paid_between(start, end)
    revenue = round(sum(o["total"] for o in orders), 2)
    hours: dict[str, float] = {f"{h:02d}h": 0 for h in range(10, 24)}
    for o in orders:
        k = f"{o['paid_at'].astimezone(TZ).hour:02d}h"
        hours[k] = round(hours.get(k, 0) + o["total"], 2)
    channels: dict[str, float] = {}
    for o in orders:
        channels[o["source"]] = channels.get(o["source"], 0) + o["total"]
    last7 = []
    for d in range(6, -1, -1):
        day = (datetime.now(TZ) - timedelta(days=d)).strftime("%Y-%m-%d")
        s, e = day_bounds(day)
        agg = await db.orders.aggregate([{"$match": {"status": "pago", "paid_at": {"$gte": s, "$lt": e}}},
                                         {"$group": {"_id": None, "t": {"$sum": "$total"}}}]).to_list(1)
        last7.append({"name": day[8:10] + "/" + day[5:7], "value": round(agg[0]["t"], 2) if agg else 0})
    low = await db.ingredients.find({"$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0}).to_list(100)
    return {
        "date": today, "revenue_today": revenue, "orders_today": len(orders),
        "avg_ticket": round(revenue / len(orders), 2) if orders else 0,
        "open_tables": await db.tables.count_documents({"status": {"$in": ["ocupada", "conta"]}}),
        "total_tables": await db.tables.count_documents({}),
        "kitchen_pending": await db.kitchen_tickets.count_documents({"status": {"$in": ["novo", "preparo"]}}),
        "delivery_pending": await db.orders.count_documents({"channel": "delivery", "delivery_status": "pendente"}),
        "low_stock": low,
        "sales_by_hour": [{"name": k, "value": v} for k, v in sorted(hours.items())],
        "by_payment": nv(payment_totals(orders), PAY_LABEL),
        "by_channel": nv(channels, SRC_LABEL),
        "top_products": top_products(orders, 5),
        "last7": last7,
        "cash_open": bool(await current_cash()),
    }


@router.get("/reports/dre", response_model=Dre)
async def dre(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        s, _e = day_bounds(start)
        _s, e = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Datas inválidas (use AAAA-MM-DD)")
    if s >= e:
        raise HTTPException(400, "Data inicial deve ser anterior à final")
    orders = await paid_between(s, e)
    gross = round(sum(o["subtotal"] + o.get("service_fee", 0) + o.get("delivery_fee", 0) for o in orders), 2)
    discounts = round(sum(o.get("discount", 0) for o in orders), 2)
    mfees = round(sum(o.get("marketplace_fee", 0) for o in orders), 2)
    taxes = round((gross - discounts) * TAX_RATE, 2)
    fees = await card_fee_table()
    card_fees = round(sum(v * fees.get(k, 0) / 100 for k, v in method_totals(orders, with_brand=True).items()
                          if k.startswith(("credito:", "debito:")) or (":" not in k and k in fees)), 2)
    net_rev = round(gross - discounts - mfees - card_fees - taxes, 2)
    cmv = round(sum(o.get("cmv", 0) for o in orders), 2)
    gross_profit = round(net_rev - cmv, 2)
    emps = {e["id"]: e for e in await db.employees.find({}, {"_id": 0, "pin_hash": 0}).to_list(500)}
    comm: dict[str, float] = {}
    for o in orders:
        if o.get("waiter_id") and o["channel"] == "mesa":
            comm[o["waiter_id"]] = comm.get(o["waiter_id"], 0) + o["subtotal"]
    commission_list = []
    for eid, sales in comm.items():
        emp = emps.get(eid)
        if emp and emp.get("commission_pct"):
            commission_list.append({"employee_id": eid, "name": emp["name"], "sales": round(sales, 2),
                                    "pct": emp["commission_pct"], "commission": round(sales * emp["commission_pct"] / 100, 2)})
    commissions = round(sum(c["commission"] for c in commission_list), 2)
    exps = await db.expenses.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(5000)
    exp_cat: dict[str, float] = {}
    for x in exps:
        exp_cat[x["category"]] = exp_cat.get(x["category"], 0) + x["amount"]
    paid_bills = await db.bills.find({"status": "pago", "paid_date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(10000)
    bills_paid = 0.0
    other_revenue = 0.0
    for b in paid_bills:
        if b["kind"] == "pagar":
            cat = b.get("category_name") or "Contas a pagar"
            exp_cat[cat] = exp_cat.get(cat, 0) + b["paid_amount"]
            bills_paid += b["paid_amount"]
        else:
            other_revenue += b["paid_amount"]
    expenses = round(sum(exp_cat.values()), 2)
    other_revenue = round(other_revenue, 2)
    net = round(gross_profit + other_revenue - commissions - expenses, 2)
    daily: dict[str, float] = {}
    for o in orders:
        k = o["paid_at"].astimezone(TZ).strftime("%d/%m")
        daily[k] = round(daily.get(k, 0) + o["total"], 2)
    by_source: dict[str, float] = {}
    for o in orders:
        by_source[o["source"]] = by_source.get(o["source"], 0) + o["total"]
    return {
        "start": start, "end": end, "gross_revenue": gross, "discounts": discounts, "marketplace_fees": mfees, "card_fees": card_fees,
        "taxes": taxes, "net_revenue": net_rev, "cmv": cmv, "gross_profit": gross_profit, "commissions": commissions,
        "expenses": expenses, "expenses_by_category": nv(exp_cat), "net_profit": net,
        "margin_pct": round(net / gross * 100, 1) if gross else 0, "orders": len(orders),
        "by_payment": nv(payment_totals(orders), {**PAY_LABEL, **{m["key"]: m["name"] for m in await db.payment_methods.find({}, {"_id": 0, "key": 1, "name": 1}).to_list(200)}}), "by_source": nv(by_source, SRC_LABEL),
        "daily": [{"name": k, "value": v} for k, v in sorted(daily.items(), key=lambda x: (x[0][3:], x[0][:2]))],
        "top_products": top_products(orders, 10), "commission_list": commission_list,
        "other_revenue": other_revenue, "bills_paid": round(bills_paid, 2),
    }


@router.get("/reports/options", response_model=list[OptionRank])
async def option_ranking(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    s, _e = day_bounds(start)
    _s, e = day_bounds(end)
    agg: dict[tuple[str, str], dict] = {}
    for o in await paid_between(s, e):
        for i in o["items"]:
            if i.get("cancelled"):
                continue
            for label in i.get("options", []):
                g, _, n = label.partition(": ")
                a = agg.setdefault((g, n), {"group": g, "name": n, "qty": 0, "products": set()})
                a["qty"] += i["qty"]
                a["products"].add(i["name"])
    out = [{**a, "products": sorted(a["products"])} for a in agg.values()]
    return sorted(out, key=lambda x: (x["group"], -x["qty"]))


@router.get("/settings/card-fees", response_model=CardFees)
async def get_card_fees(_: dict = Depends(require("caixa"))):
    return {"fees": await card_fee_table()}


@router.put("/settings/card-fees", response_model=CardFees)
async def put_card_fees(body: CardFees, _: dict = Depends(require())):
    allowed = {f"{m}:{b}" for m in ("credito", "debito") for b in ("visa", "mastercard", "elo")}
    fees = {k: round(v, 2) for k, v in body.fees.items() if k in allowed and 0 <= v <= 20}
    await db.settings.update_one({"_id": "card_fees"}, {"$set": {"fees": fees}}, upsert=True)
    return {"fees": fees}


@router.get("/expenses", response_model=list[Expense])
async def list_expenses(_: dict = Depends(require())):
    return await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(1000)


@router.post("/expenses", response_model=Expense)
async def create_expense(body: ExpenseIn, _: dict = Depends(require())):
    x = Expense(**body.model_dump()).model_dump()
    await db.expenses.insert_one(dict(x))
    return x


@router.delete("/expenses/{id}", response_model=OkOut)
async def delete_expense(id: str, _: dict = Depends(require())):
    res = await db.expenses.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Despesa não encontrada")
    return OkOut()


_ = timezone
