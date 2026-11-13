import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from pydantic import BaseModel, Field

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


@router.get("/reports/opening-weekdays")
async def opening_weekdays(_: dict = Depends(require())):
    """Use completed days with sales; the ledger alone cannot identify opening days without sales."""
    end = date.fromisoformat(local_today())
    start = end - timedelta(weeks=12)
    lower, _ = day_bounds(start.isoformat())
    upper, _ = day_bounds(end.isoformat())
    rows = await db.orders.aggregate([
        {"$match": {"status": "pago", "paid_at": {"$gte": lower, "$lt": upper}}},
        {"$group": {"_id": {"$dateToString": {"date": "$paid_at", "format": "%Y-%m-%d", "timezone": "America/Sao_Paulo"}},
                    "revenue": {"$sum": {"$add": ["$subtotal", {"$ifNull": ["$service_fee", 0]}, {"$ifNull": ["$delivery_fee", 0]}]}}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(84)
    grouped = [[] for _ in range(7)]
    for row in rows:
        grouped[date.fromisoformat(row["_id"]).weekday()].append(row)
    result = []
    for weekday, samples in enumerate(grouped):
        revenue = sum(row["revenue"] for row in samples)
        orders = sum(row["orders"] for row in samples)
        result.append({"weekday": weekday, "samples": len(samples),
                       "average_revenue": round(revenue / len(samples), 2) if samples else None,
                       "average_orders": round(orders / len(samples), 1) if samples else None,
                       "average_ticket": round(revenue / orders, 2) if orders else None})
    return result


class DailySalesGoal(BaseModel):
    amount: float = Field(ge=0, le=100000000)


@router.get("/reports/daily-goal")
async def get_daily_goal(_: dict = Depends(require("caixa"))):
    config = await db.settings.find_one({"_id": "daily_sales_goal"}, {"_id": 0, "amount": 1})
    return {"amount": float((config or {}).get("amount", 0))}


@router.put("/reports/daily-goal")
async def save_daily_goal(payload: DailySalesGoal, _: dict = Depends(require("admin"))):
    amount = round(payload.amount, 2)
    await db.settings.update_one({"_id": "daily_sales_goal"}, {"$set": {"amount": amount}}, upsert=True)
    return {"amount": amount}


@router.get("/reports/daily-performance")
async def daily_performance(_: dict = Depends(require("caixa"))):
    today = date.fromisoformat(local_today())
    start, end = day_bounds(today.isoformat())
    prev_start, prev_end = day_bounds((today - timedelta(days=1)).isoformat())
    current = await paid_between(start, end)
    previous = await paid_between(prev_start, prev_end)
    revenue = round(sum(float(o.get("total") or 0) for o in current), 2)
    previous_revenue = round(sum(float(o.get("total") or 0) for o in previous), 2)
    cmv = round(sum(float(o.get("cmv") or 0) for o in current), 2)
    config = await db.settings.find_one({"_id": "daily_sales_goal"}, {"_id": 0, "amount": 1})
    goal = float((config or {}).get("amount", 0))
    return {"date": today.isoformat(), "revenue": revenue, "previous_revenue": previous_revenue,
            "revenue_change_pct": round((revenue - previous_revenue) / previous_revenue * 100, 1) if previous_revenue > 0 else None,
            "estimated_gross_contribution": round(revenue - cmv, 2),
            "recorded_cmv": cmv, "goal": goal,
            "goal_pct": round(revenue / goal * 100, 1) if goal > 0 else None,
            "remaining": round(max(0, goal - revenue), 2),
            "note": "Comparação do dia atual (parcial) com o dia anterior completo. Contribuição bruta estimada: vendas menos CMV registrado; não desconta taxas, impostos, salários ou despesas fixas. CMV ausente pode superestimar o resultado."}


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
    low = await db.ingredients.find({"min_stock": {"$gt": 0}, "$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0}).to_list(100)
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


def executive_snapshot(orders: list[dict], expenses: list[dict], ingredients: list[dict], staff: list[dict]) -> dict:
    paid = [o for o in orders if o.get("status") == "pago"]
    revenue = round(sum(float(o.get("total") or 0) for o in paid), 2)
    expense_total = round(sum(float(x.get("amount") or 0) for x in expenses), 2)
    cmv = round(sum(float(o.get("cmv") or 0) for o in paid), 2)
    critical = [i for i in ingredients if float(i.get("stock") or 0) <= float(i.get("min_stock") or 0) and float(i.get("min_stock") or 0) > 0]
    active = sum(1 for e in staff if e.get("active", True))
    alerts = []
    if critical:
        alerts.append({"severity": "warning", "title": "Estoque crítico", "detail": f"{len(critical)} ingrediente(s) no estoque mínimo ou abaixo."})
    if expense_total > revenue and paid:
        alerts.append({"severity": "warning", "title": "Despesas acima das vendas", "detail": "Despesas lançadas no período superam vendas pagas."})
    if not paid:
        alerts.append({"severity": "info", "title": "Sem vendas pagas", "detail": "Não há pedidos pagos no período."})
    return {"revenue": revenue, "paid_orders": len(paid), "average_ticket": round(revenue / len(paid), 2) if paid else 0,
            "recorded_expenses": expense_total, "recorded_cmv": cmv,
            "indicative_balance": round(revenue - expense_total - cmv, 2),
            "critical_stock_count": len(critical), "critical_stock": [{"id": i.get("id"), "name": i.get("name"), "stock": i.get("stock"), "min_stock": i.get("min_stock")} for i in critical[:10]],
            "active_employees": active, "alerts": alerts,
            "note": "Saldo indicativo = vendas pagas menos CMV registrado e despesas lançadas. Não é lucro contábil: exclui impostos, taxas, contas e comissões não lançadas; despesas podem duplicar custos."}


@router.get("/reports/executive")
async def executive_report(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if first > last or (last - first).days > 90:
            raise ValueError("intervalo")
        begin, _ = day_bounds(start)
        _, finish = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Período inválido (máximo de 90 dias)")
    orders = await paid_between(begin, finish)
    expenses = await db.expenses.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0, "amount": 1}).to_list(10000)
    ingredients = await db.ingredients.find({"min_stock": {"$gt": 0}}, {"_id": 0, "id": 1, "name": 1, "stock": 1, "min_stock": 1}).to_list(5000)
    staff = await db.employees.find({}, {"_id": 0, "active": 1}).to_list(500)
    return {"start": start, "end": end, **executive_snapshot(orders, expenses, ingredients, staff)}


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


def summarize_cashflow(orders: list[dict], bills: list[dict], expenses: list[dict], start: str, end: str) -> dict:
    """Operational cash-flow estimate by payment/settlement date, not an accounting bank reconciliation."""
    days: dict[str, dict] = {}
    def day(key: str) -> dict:
        return days.setdefault(key, {"date": key, "sales": 0.0, "receivables": 0.0, "payables": 0.0, "expenses": 0.0})
    for order in orders:
        paid_at = order.get("paid_at")
        if not paid_at:
            continue
        key = paid_at.astimezone(TZ).date().isoformat()
        if start <= key <= end:
            # Fiado is a receivable, not cash collected on the sale date.
            amount = sum(float(p.get("amount", 0)) for p in order.get("payments", []) if p.get("method") != "fiado")
            day(key)["sales"] += amount
    for bill in bills:
        key = bill.get("paid_date") or ""
        if not start <= key <= end:
            continue
        field = "receivables" if bill.get("kind") == "receber" else "payables"
        day(key)[field] += float(bill.get("paid_amount", 0))
    for expense in expenses:
        key = expense.get("date") or ""
        if start <= key <= end:
            day(key)["expenses"] += float(expense.get("amount", 0))
    rows = []
    for row in sorted(days.values(), key=lambda r: r["date"]):
        rounded = {k: round(v, 2) if k != "date" else v for k, v in row.items()}
        rounded["balance"] = round(row["sales"] + row["receivables"] - row["payables"] - row["expenses"], 2)
        rows.append(rounded)
    totals = {k: round(sum(row[k] for row in rows), 2) for k in ("sales", "receivables", "payables", "expenses", "balance")}
    return {"start": start, "end": end, "days": rows, "totals": totals,
            "note": "Fluxo operacional estimado: vendas recebidas (exceto fiado), contas baixadas e despesas lançadas. Não concilia extratos bancários, estornos ou recebimentos de fiado; despesas duplicadas em contas e lançamentos podem ser contadas duas vezes."}


@router.get("/reports/cashflow")
async def cashflow(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require("caixa"))):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        s, _ = day_bounds(start)
        _, e = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Datas inválidas (use AAAA-MM-DD)")
    if s >= e:
        raise HTTPException(400, "Data inicial deve ser anterior à final")
    if (date.fromisoformat(end) - date.fromisoformat(start)).days > 366:
        raise HTTPException(400, "Período máximo de 366 dias")
    orders = await paid_between(s, e)
    bills = await db.bills.find({"status": "pago", "paid_date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(10000)
    expenses = await db.expenses.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(10000)
    return summarize_cashflow(orders, bills, expenses, start, end)


def employee_sales_summary(orders: list[dict], employees: list[dict]) -> list[dict]:
    """Sales and estimated commissions based exclusively on paid table orders."""
    by_id = {emp["id"]: {"employee_id": emp["id"], "name": emp["name"],
              "commission_pct": float(emp.get("commission_pct") or 0),
              "sales": 0.0, "orders": 0} for emp in employees if emp.get("role") == "garcom"}
    for order in orders:
        if order.get("status") != "pago" or order.get("channel") != "mesa":
            continue
        row = by_id.get(order.get("waiter_id"))
        if row is None:
            continue
        row["sales"] += float(order.get("total") or 0)
        row["orders"] += 1
    for row in by_id.values():
        row["sales"] = round(row["sales"], 2)
        row["average_ticket"] = round(row["sales"] / row["orders"], 2) if row["orders"] else 0
        row["estimated_commission"] = round(row["sales"] * row["commission_pct"] / 100, 2)
    return sorted(by_id.values(), key=lambda row: (-row["sales"], row["name"]))


@router.get("/reports/employee-performance")
async def employee_performance(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        s, _ = day_bounds(start)
        _, e = day_bounds(end)
        if date.fromisoformat(end) < date.fromisoformat(start) or (date.fromisoformat(end) - date.fromisoformat(start)).days > 366:
            raise ValueError("Período inválido")
    except ValueError:
        raise HTTPException(400, "Período inválido (máximo de 366 dias)")
    employees = await db.employees.find({"role": "garcom"}, {"_id": 0, "id": 1, "name": 1, "role": 1, "commission_pct": 1}).to_list(500)
    rows = employee_sales_summary(await paid_between(s, e), employees)
    return {"start": start, "end": end, "employees": rows,
            "total_sales": round(sum(row["sales"] for row in rows), 2),
            "total_estimated_commission": round(sum(row["estimated_commission"] for row in rows), 2),
            "note": "Comissões estimadas sobre o total de pedidos de mesa pagos atribuídos ao garçom. Não são folha de pagamento nem consideram estornos posteriores, rateios, taxas ou metas individuais."}


def build_business_insights(orders: list[dict], expenses: list[dict], products: list[dict]) -> dict:
    """Explainable business rules over recorded data; no external AI or fabricated predictions."""
    paid = [o for o in orders if o.get("status") == "pago"]
    revenue = round(sum(float(o.get("total") or 0) for o in paid), 2)
    spending = round(sum(float(e.get("amount") or 0) for e in expenses), 2)
    grouped: dict[str, dict] = {}
    for order in paid:
        for item in order.get("items", []):
            if item.get("cancelled"):
                continue
            qty = float(item.get("qty") or 0)
            if qty <= 0:
                continue
            key = str(item.get("product_id") or item.get("name") or "")
            row = grouped.setdefault(key, {"product_id": key, "name": item.get("name") or "Produto",
                                            "qty": 0.0, "revenue": 0.0, "cost": 0.0})
            row["qty"] += qty
            row["revenue"] += qty * float(item.get("unit_price") or 0)
            row["cost"] += qty * float(item.get("unit_cost") or 0)
    rows = []
    for row in grouped.values():
        rev, cost = row["revenue"], row["cost"]
        rows.append({**row, "revenue": round(rev, 2), "cost": round(cost, 2),
                     "contribution": round(rev - cost, 2),
                     "margin_pct": round((rev - cost) / rev * 100, 1) if rev > 0 else 0})
    rows.sort(key=lambda row: (-row["contribution"], row["name"]))
    sold_ids = set(grouped)
    unsold = [p["name"] for p in products if p.get("active") and p.get("id") not in sold_ids]
    suggestions = []
    if not paid:
        suggestions.append({"level": "info", "title": "Sem vendas pagas", "detail": "Não há vendas pagas no período para avaliar tendências."})
    if spending > revenue and paid:
        suggestions.append({"level": "warning", "title": "Despesas acima das vendas",
                            "detail": "As despesas operacionais lançadas superam o total de vendas pagas no período. Confira lançamentos e outras receitas."})
    if rows and rows[0]["contribution"] > 0:
        suggestions.append({"level": "info", "title": "Produto com maior contribuição bruta",
                            "detail": f"{rows[0]['name']} gerou contribuição bruta estimada de R$ {rows[0]['contribution']:.2f}, antes de descontos e despesas."})
    if unsold:
        suggestions.append({"level": "info", "title": "Produtos sem vendas",
                            "detail": f"{len(unsold)} produto(s) ativo(s) não tiveram vendas registradas no período. Avalie divulgação e disponibilidade."})
    return {"revenue": revenue, "operating_expenses": spending, "paid_orders": len(paid),
            "average_ticket": round(revenue / len(paid), 2) if paid else 0,
            "top_contribution": rows[:5], "unsold_products": unsold[:20], "unsold_count": len(unsold),
            "insights": suggestions, "method": "regras_explicaveis",
            "note": "Análise automática baseada em regras, não IA generativa. Margens usam custos registrados nos itens e não incluem descontos, impostos, taxas ou despesas; dados ausentes podem distorcer resultados."}


@router.get("/reports/intelligent-insights")
async def intelligent_insights(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if first > last or (last - first).days > 366:
            raise ValueError("intervalo")
        s, _ = day_bounds(start)
        _, e = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Período inválido (máximo de 366 dias)")
    orders = await paid_between(s, e)
    expenses = await db.expenses.find({"date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(10000)
    products = await db.products.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "active": 1}).to_list(5000)
    return {"start": start, "end": end, **build_business_insights(orders, expenses, products)}


def predict_sales_and_stock(orders: list[dict], products: list[dict], ingredients: list[dict], days: int = 28) -> dict:
    """Historical daily-rate baseline, not a machine-learning prediction."""
    daily = {}
    sold = {}
    product_map = {p["id"]: p for p in products}
    demand = {}
    for order in orders:
        if order.get("status") != "pago":
            continue
        timestamp = order.get("paid_at")
        if timestamp is None:
            continue
        day = timestamp.astimezone(TZ).date().isoformat()
        daily[day] = daily.get(day, 0) + float(order.get("total") or 0)
        for item in order.get("items", []):
            if item.get("cancelled") or float(item.get("qty") or 0) <= 0:
                continue
            pid = item.get("product_id")
            if pid not in product_map:
                continue
            sold[pid] = sold.get(pid, 0) + float(item["qty"])
    for pid, qty in sold.items():
        for component in product_map[pid].get("recipe", []):
            ingredient_id = component.get("ingredient_id")
            if ingredient_id:
                demand[ingredient_id] = demand.get(ingredient_id, 0) + qty * float(component.get("qty") or 0)
    total = round(sum(daily.values()), 2)
    average = total / days
    suggestions = []
    for ing in ingredients:
        used = demand.get(ing["id"], 0)
        per_day = used / days
        stock = float(ing.get("stock") or 0)
        minimum = float(ing.get("min_stock") or 0)
        suggested = max(0, per_day * 7 + minimum - stock)
        if suggested > 0 and (per_day > 0 or stock < minimum):
            suggestions.append({"ingredient_id": ing["id"], "name": ing["name"], "unit": ing.get("unit", ""),
                                "stock": round(stock, 2), "daily_usage": round(per_day, 3),
                                "suggested_purchase": round(suggested, 2),
                                "days_cover": round(stock / per_day, 1) if per_day > 0 else None})
    suggestions.sort(key=lambda row: (row["days_cover"] is None, row["days_cover"] if row["days_cover"] is not None else 99999))
    return {"observed_revenue": total, "average_daily_revenue": round(average, 2),
            "projected_next_7_days": round(average * 7, 2), "paid_days": len(daily),
            "restock_suggestions": suggestions[:30],
            "method": "media_diaria_historica",
            "note": "Estimativas por média de dias corridos e consumo das fichas técnicas. Não consideram sazonalidade, compras já solicitadas, perdas, produção, entregas futuras ou alterações de demanda."}


@router.get("/reports/sales-stock-forecast")
async def sales_stock_forecast(days: int = 28, _: dict = Depends(require())):
    if days < 7 or days > 90:
        raise HTTPException(400, "Informe entre 7 e 90 dias")
    today = date.fromisoformat(local_today())
    start = (today - timedelta(days=days)).isoformat()
    s, _ = day_bounds(start)
    _, e = day_bounds((today - timedelta(days=1)).isoformat())
    orders = await paid_between(s, e)
    products = await db.products.find({"active": True}, {"_id": 0, "id": 1, "recipe": 1}).to_list(5000)
    ingredients = await db.ingredients.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1, "stock": 1, "min_stock": 1}).to_list(5000)
    return {"days": days, **predict_sales_and_stock(orders, products, ingredients, days)}


def compare_sales_trends(current: list[dict], previous: list[dict], min_orders: int = 3) -> dict:
    """Equal-length paid-sales comparisons with explicit small-sample warnings."""
    def summarize(orders: list[dict]) -> tuple[float, int, dict]:
        revenue = 0.0
        count = 0
        products = {}
        for order in orders:
            if order.get("status") != "pago":
                continue
            count += 1
            revenue += float(order.get("total") or 0)
            for item in order.get("items", []):
                if item.get("cancelled") or float(item.get("qty") or 0) <= 0:
                    continue
                key = str(item.get("product_id") or item.get("name") or "")
                if not key:
                    continue
                row = products.setdefault(key, {"product_id": key, "name": item.get("name") or "Produto", "qty": 0.0})
                row["qty"] += float(item["qty"])
        return round(revenue, 2), count, products

    revenue, count, now_products = summarize(current)
    prev_revenue, prev_count, old_products = summarize(previous)
    change_pct = round((revenue - prev_revenue) / prev_revenue * 100, 1) if prev_revenue > 0 else None
    alerts = []
    if count < min_orders or prev_count < min_orders:
        alerts.append({"level": "info", "title": "Amostra pequena",
                       "detail": "Um dos períodos tem poucas vendas pagas; interprete tendências com cautela."})
    if change_pct is not None and change_pct <= -15 and count >= min_orders and prev_count >= min_orders:
        alerts.append({"level": "warning", "title": "Queda de faturamento",
                       "detail": f"As vendas pagas caíram {abs(change_pct):.1f}% em relação ao período anterior equivalente."})
    elif change_pct is not None and change_pct >= 15 and count >= min_orders and prev_count >= min_orders:
        alerts.append({"level": "info", "title": "Crescimento de faturamento",
                       "detail": f"As vendas pagas cresceram {change_pct:.1f}% em relação ao período anterior equivalente."})
    trends = []
    for key in set(now_products) | set(old_products):
        now = now_products.get(key, {})
        old = old_products.get(key, {})
        new_qty, old_qty = now.get("qty", 0), old.get("qty", 0)
        delta = new_qty - old_qty
        trends.append({"product_id": key, "name": now.get("name") or old.get("name"),
                       "current_qty": round(new_qty, 2), "previous_qty": round(old_qty, 2),
                       "delta_qty": round(delta, 2),
                       "change_pct": round(delta / old_qty * 100, 1) if old_qty else None})
    trends.sort(key=lambda p: (-abs(p["delta_qty"]), p["name"]))
    return {"current_revenue": revenue, "previous_revenue": prev_revenue,
            "revenue_change_pct": change_pct, "current_orders": count, "previous_orders": prev_count,
            "current_average_ticket": round(revenue / count, 2) if count else 0,
            "previous_average_ticket": round(prev_revenue / prev_count, 2) if prev_count else 0,
            "products": trends[:30], "alerts": alerts,
            "note": "Comparação descritiva de períodos de mesma duração, sem ajuste por sazonalidade, feriados, dias da semana ou inflação. Não é previsão por IA."}


@router.get("/reports/sales-trends")
async def sales_trends(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        days = (last - first).days + 1
        if not 1 <= days <= 90:
            raise ValueError("intervalo")
        begin, _ = day_bounds(start)
        _, finish = day_bounds(end)
        prior_first = first - timedelta(days=days)
        prior_last = first - timedelta(days=1)
        prior_begin, _ = day_bounds(prior_first.isoformat())
        _, prior_finish = day_bounds(prior_last.isoformat())
    except ValueError:
        raise HTTPException(400, "Período inválido (1 a 90 dias)")
    current = await paid_between(begin, finish)
    previous = await paid_between(prior_begin, prior_finish)
    return {"start": start, "end": end, "previous_start": prior_first.isoformat(),
            "previous_end": prior_last.isoformat(), **compare_sales_trends(current, previous)}


@router.get("/reports/forecast")
async def financial_forecast(months: int = 3, _: dict = Depends(require())):
    """Estimativas com base em meses completos; não são garantia de resultado."""
    if not 1 <= months <= 12:
        raise HTTPException(400, "Informe entre 1 e 12 meses de histórico")
    today = date.fromisoformat(local_today())

    def month_shift(y: int, m: int, delta: int) -> tuple[int, int]:
        index = y * 12 + m - 1 + delta
        return index // 12, index % 12 + 1

    history = []
    for offset in range(-months, 0):
        year, month = month_shift(today.year, today.month, offset)
        first = date(year, month, 1)
        last = date(year, month, calendar.monthrange(year, month)[1])
        # Reuse the same DRE calculation as the finance report.
        result = await dre(start=first.isoformat(), end=last.isoformat(), _=_)
        history.append({"month": first.strftime("%Y-%m"),
                        "revenue": result["net_revenue"] + result["other_revenue"],
                        "profit": result["net_profit"],
                        "expenses": result["expenses"] + result["commissions"],
                        "margin_pct": result["margin_pct"]})
    avg = lambda key: round(sum(x[key] for x in history) / len(history), 2)
    avg_revenue = avg("revenue")
    avg_profit = avg("profit")
    avg_expenses = avg("expenses")
    future = []
    for offset in range(0, 3):
        year, month = month_shift(today.year, today.month, offset)
        first = date(year, month, 1)
        last = date(year, month, calendar.monthrange(year, month)[1])
        start_date = max(first, today).isoformat()
        # Future obligations are displayed separately to avoid counting them twice
        # in the historical expense baseline.
        upcoming = await db.bills.find({"kind": "pagar", "status": "aberto",
            "due_date": {"$gte": start_date, "$lte": last.isoformat()}},
            {"_id": 0, "amount": 1}).to_list(10000)
        scheduled = round(sum(b["amount"] for b in upcoming), 2)
        future.append({"month": first.strftime("%Y-%m"),
                       "projected_revenue": avg_revenue,
                       "projected_profit": avg_profit,
                       "projected_expenses": avg_expenses,
                       "scheduled_payables": scheduled})
    return {"basis": "media_simples_meses_fechados",
            "historical_months": months,
            "history": history,
            "average_monthly_profit": avg_profit,
            "average_monthly_expenses": avg_expenses,
            "average_monthly_revenue": avg_revenue,
            "average_profit_margin_pct": round(avg_profit / avg_revenue * 100, 1) if avg_revenue else 0,
            "forecast": future,
            "note": "Projecoes estimadas pela media dos meses anteriores. Contas futuras sao exibidas separadamente, sem deducao dupla. Valores dependem de vendas, custos e despesas registrados."}



@router.get("/reports/sales-intelligence")
async def sales_intelligence(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    """Rank paid sales by units and highlight products without sales in the period."""
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        s, _ = day_bounds(start)
        _, e = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Datas inválidas (use AAAA-MM-DD)")
    if s >= e:
        raise HTTPException(400, "Data inicial deve ser anterior à final")
    products = await db.products.find({"active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
    grouped: dict[str, dict] = {}
    for order in await paid_between(s, e):
        for item in order.get("items", []):
            if item.get("cancelled"):
                continue
            pid = item.get("product_id") or item.get("name", "")
            row = grouped.setdefault(pid, {"product_id": pid, "name": item.get("name", ""), "qty": 0, "revenue": 0.0})
            row["qty"] += item.get("qty", 0)
            row["revenue"] += item.get("qty", 0) * item.get("unit_price", 0)
    ranked = sorted(grouped.values(), key=lambda row: (-row["qty"], -row["revenue"]))
    for row in ranked:
        row["revenue"] = round(row["revenue"], 2)
    unsold = [p for p in products if p["id"] not in grouped]
    return {"start": start, "end": end, "top": ranked[:10],
            "least": sorted(ranked, key=lambda row: (row["qty"], row["revenue"]))[:10],
            "unsold": unsold, "active_products": len(products),
            "note": "Ranking por quantidade em pedidos pagos. Produtos sem vendas consideram somente o cadastro ativo atual."}


@router.get("/reports/product-profit")
async def product_profit(start: Optional[str] = None, end: Optional[str] = None, _: dict = Depends(require())):
    """Gross product contribution from paid sales; excludes overhead, taxes and fees."""
    end = end or local_today()
    start = start or end[:8] + "01"
    try:
        s, _ = day_bounds(start)
        _, e = day_bounds(end)
    except ValueError:
        raise HTTPException(400, "Datas inválidas (use AAAA-MM-DD)")
    if s >= e:
        raise HTTPException(400, "Data inicial deve ser anterior à final")
    grouped: dict[str, dict] = {}
    for order in await paid_between(s, e):
        for item in order.get("items", []):
            if item.get("cancelled"):
                continue
            qty = float(item.get("qty", 0))
            if qty <= 0:
                continue
            pid = item.get("product_id") or item.get("name", "")
            row = grouped.setdefault(pid, {"product_id": pid, "name": item.get("name", ""),
                                            "qty": 0.0, "revenue": 0.0, "cost": 0.0})
            row["qty"] += qty
            row["revenue"] += qty * float(item.get("unit_price", 0))
            row["cost"] += qty * float(item.get("unit_cost", 0))
    rows = []
    for row in grouped.values():
        revenue = round(row["revenue"], 2)
        cost = round(row["cost"], 2)
        profit = round(revenue - cost, 2)
        rows.append({**row, "qty": round(row["qty"], 3), "revenue": revenue, "cost": cost,
                     "profit": profit, "margin_pct": round(profit / revenue * 100, 1) if revenue else 0})
    rows.sort(key=lambda row: (-row["profit"], row["name"]))
    return {"start": start, "end": end, "products": rows,
            "revenue": round(sum(row["revenue"] for row in rows), 2),
            "cost": round(sum(row["cost"] for row in rows), 2),
            "profit": round(sum(row["profit"] for row in rows), 2),
            "note": "Margem bruta estimada com custo registrado na venda; não inclui descontos, taxas, impostos e despesas."}


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

class LiveMusicIn(BaseModel):
    date: date
    artist: str = Field(min_length=1, max_length=160)
    artist_fee: float = Field(ge=0, le=10000000)
    extra_costs: float = Field(ge=0, le=10000000)
    contribution_margin_pct: float = Field(gt=0, le=100)


@router.get("/reports/live-music")
async def live_music_report(event_date: str | None = None, _: dict = Depends(require("caixa"))):
    event_day = event_date or local_today()
    try:
        date.fromisoformat(event_day)
        start, end = day_bounds(event_day)
    except ValueError:
        raise HTTPException(400, "Data inválida")
    saved = await db.live_music_events.find_one({"date": event_day}, {"_id": 0})
    config = saved or {"date": event_day, "artist": "", "artist_fee": 0, "extra_costs": 0, "contribution_margin_pct": 40}
    orders = await paid_between(start, end)
    revenue = round(sum(float(o.get("total") or 0) for o in orders), 2)
    margin = config["contribution_margin_pct"] / 100
    costs = config["artist_fee"] + config["extra_costs"]
    target = round(costs / margin, 2)
    contribution = round(revenue * margin, 2)
    return {**config, "saved": saved is not None, "revenue": revenue, "target": target,
            "remaining": round(max(0, target - revenue), 2), "contribution": contribution,
            "event_result": round(contribution - costs, 2), "reached": contribution >= costs}


@router.get("/reports/live-music/history")
async def live_music_history(event_date: str | None = None, weeks: int = 8, _: dict = Depends(require("caixa"))):
    """Compare paid sales on the same weekday, with and without registered live music.

    Descriptive only: differences cannot be attributed causally to music.
    """
    if not 2 <= weeks <= 16:
        raise HTTPException(400, "Informe entre 2 e 16 semanas")
    try:
        selected = date.fromisoformat(event_date or local_today())
    except ValueError:
        raise HTTPException(400, "Data inválida")
    first = selected - timedelta(weeks=weeks)
    start, _ = day_bounds(first.isoformat())
    _, end = day_bounds(selected.isoformat())
    orders = await paid_between(start, end)
    totals: dict[str, dict] = {}
    for order in orders:
        paid_at = order.get("paid_at")
        if not isinstance(paid_at, datetime):
            continue
        day = paid_at.astimezone(TZ).date().isoformat()
        row = totals.setdefault(day, {"revenue": 0.0, "orders": 0})
        row["revenue"] += float(order.get("total") or 0)
        row["orders"] += 1
    events = await db.live_music_events.find(
        {"date": {"$gte": first.isoformat(), "$lte": selected.isoformat()}},
        {"_id": 0, "date": 1, "artist": 1, "artist_fee": 1, "extra_costs": 1,
         "contribution_margin_pct": 1},
    ).to_list(200)
    by_date = {event["date"]: event for event in events}
    rows = []
    # Same weekday only, and never compare with a future day.
    for n in range(weeks, -1, -1):
        day = selected - timedelta(weeks=n)
        if day > date.fromisoformat(local_today()):
            continue
        key = day.isoformat()
        event = by_date.get(key)
        sales = totals.get(key, {"revenue": 0.0, "orders": 0})
        revenue = round(sales["revenue"], 2)
        costs = float(event.get("artist_fee", 0)) + float(event.get("extra_costs", 0)) if event else 0
        margin = float(event.get("contribution_margin_pct", 40)) / 100 if event else 0.4
        rows.append({"date": key, "artist": event.get("artist", "") if event else "",
                     "has_music": bool(event), "revenue": revenue, "orders": sales["orders"],
                     "average_ticket": round(revenue / sales["orders"], 2) if sales["orders"] else 0,
                     "event_cost": round(costs, 2),
                     "estimated_event_result": round(revenue * margin - costs, 2) if event else None})
    with_music = [r for r in rows if r["has_music"]]
    without_music = [r for r in rows if not r["has_music"]]
    def summary(group):
        count = len(group)
        return {"days": count, "average_revenue": round(sum(r["revenue"] for r in group) / count, 2) if count else None,
                "average_ticket": round(sum(r["average_ticket"] for r in group) / count, 2) if count else None,
                "average_orders": round(sum(r["orders"] for r in group) / count, 1) if count else None}
    music = summary(with_music)
    no_music = summary(without_music)
    delta = (round(music["average_revenue"] - no_music["average_revenue"], 2)
             if music["average_revenue"] is not None and no_music["average_revenue"] is not None else None)
    return {"weekday": selected.weekday(), "weeks": weeks, "days": rows,
            "with_music": music, "without_music": no_music, "revenue_difference": delta,
            "note": "Comparação descritiva de mesmo dia da semana, sem controle de feriados, clima, promoções ou horário. Dias sem vendas são incluídos, inclusive possíveis dias fechados. Evento é identificado somente quando cadastrado no Apollo. Diferença não comprova retorno causado pela música."}


@router.put("/reports/live-music")
async def save_live_music(payload: LiveMusicIn, _: dict = Depends(require("admin"))):
    config = payload.model_dump(mode="json")
    config["artist"] = config["artist"].strip()
    if not config["artist"]:
        raise HTTPException(400, "Informe o artista")
    await db.live_music_events.update_one({"date": config["date"]}, {"$set": config}, upsert=True)
    return {"ok": True}
