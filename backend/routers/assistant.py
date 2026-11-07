"""Apollo Assistente: consultas gerenciais deterministicas, sem envio de dados a terceiros."""
from datetime import date, timedelta
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends
from lib.auth import require
from lib.db import db
from lib.orders import day_bounds, local_today
from routers.reports import paid_between

router = APIRouter()

class AssistantQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=300)

def sales_answer(today: str, current: list[dict], previous: list[dict], goal: float) -> dict:
    revenue = round(sum(float(o.get("total") or 0) for o in current), 2)
    prior = round(sum(float(o.get("total") or 0) for o in previous), 2)
    count = len(current)
    avg = round(revenue / count, 2) if count else 0.0
    change = round((revenue - prior) / prior * 100, 1) if prior else None
    return {"date": today, "revenue": revenue, "paid_orders": count, "average_ticket": avg,
            "previous_revenue": prior, "revenue_change_pct": change,
            "goal": round(goal, 2), "goal_pct": round(revenue / goal * 100, 1) if goal > 0 else None,
            "partial_day": True}

def format_sales_answer(data: dict) -> str:
    brl = lambda n: f"R$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    parts = [f"Vendas de hoje ({data['date']}, parcial): {brl(data['revenue'])}.",
             f"{data['paid_orders']} pedido(s) pago(s); ticket médio de {brl(data['average_ticket'])}."]
    if data["revenue_change_pct"] is None:
        parts.append("Ontem não houve vendas pagas registradas; comparação percentual indisponível.")
    else:
        parts.append(f"Ontem: {brl(data['previous_revenue'])}. Variação: {data['revenue_change_pct']:+.1f}%.".replace(".", ","))
    if data["goal_pct"] is not None:
        parts.append(f"Meta diária: {brl(data['goal'])}; atingido: {str(data['goal_pct']).replace('.', ',')}%.")
    parts.append("Somente pedidos pagos; o dia ainda não terminou. Valores não representam lucro.")
    return " ".join(parts)

def yesterday_sales_answer(day: str, orders: list[dict]) -> dict:
    revenue = round(sum(float(o.get("total") or 0) for o in orders), 2)
    count = len(orders)
    return {"date": day, "revenue": revenue, "paid_orders": count,
            "average_ticket": round(revenue / count, 2) if count else 0.0, "partial_day": False}


def format_yesterday_answer(data: dict) -> str:
    brl = lambda n: f"R$ {n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return (f"Vendas de ontem ({data['date']}): {brl(data['revenue'])}. "
            f"{data['paid_orders']} pedido(s) pago(s); ticket médio de {brl(data['average_ticket'])}. "
            "Somente pedidos pagos; faturamento não representa lucro.")


def monthly_expense_answer(month: str, expenses: list[dict]) -> dict:
    total = round(sum(float(item.get("amount") or 0) for item in expenses), 2)
    return {"month": month, "recorded_expenses": total, "entries": len(expenses),
            "partial_month": month == local_today()[:7]}


def format_monthly_expense_answer(data: dict) -> str:
    brl = f"R$ {data['recorded_expenses']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    period = "em andamento" if data["partial_month"] else "encerrado"
    return (f"Despesas lançadas em {data['month']} (mês {period}): {brl}; "
            f"{data['entries']} lançamento(s). Valores registrados no Apollo; "
            "não incluem despesas ainda não lançadas e não representam lucro.")


async def monthly_expenses_response() -> dict:
    month = local_today()[:7]
    expenses = await db.expenses.find(
        {"date": {"$gte": month + "-01", "$lt": month + "-32"}},
        {"_id": 0, "amount": 1},
    ).to_list(10000)
    metrics = monthly_expense_answer(month, expenses)
    return {"supported": True, "answer": format_monthly_expense_answer(metrics),
            "metrics": metrics, "source": "despesas_lancadas_mes", "provider": "local"}


@router.post("/assistant/ask")
async def ask_assistant(payload: AssistantQuestion, _: dict = Depends(require("admin", "caixa"))):
    normalized = payload.question.casefold().strip()
    if ("despesa" in normalized or "gastei" in normalized or "gasto" in normalized) and ("mês" in normalized or "mes" in normalized):
        return await monthly_expenses_response()
    sales_question = "venda" in normalized or "faturamento" in normalized or "faturei" in normalized
    if sales_question and "ontem" in normalized:
        yesterday = (date.fromisoformat(local_today()) - timedelta(days=1)).isoformat()
        start, end = day_bounds(yesterday)
        metrics = yesterday_sales_answer(yesterday, await paid_between(start, end))
        return {"supported": True, "answer": format_yesterday_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_ontem"}
    if not (sales_question and ("hoje" in normalized or "dia" in normalized or "atual" in normalized)):
        return {"supported": False, "answer": "Posso responder sobre vendas de hoje ou de ontem.",
                "metrics": None, "source": "relatorios_internos"}
    today = local_today()
    previous = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    start, end = day_bounds(today)
    pstart, pend = day_bounds(previous)
    current = await paid_between(start, end)
    prior = await paid_between(pstart, pend)
    setting = await db.settings.find_one({"_id": "daily_sales_goal"}, {"amount": 1})
    goal = max(0.0, float((setting or {}).get("amount") or 0))
    metrics = sales_answer(today, current, prior, goal)
    return {"supported": True, "answer": format_sales_answer(metrics),
            "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria"}
