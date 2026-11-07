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

@router.post("/assistant/ask")
async def ask_assistant(payload: AssistantQuestion, _: dict = Depends(require("admin", "caixa"))):
    normalized = payload.question.casefold().strip()
    if not (("venda" in normalized or "faturamento" in normalized or "faturei" in normalized) and
            ("hoje" in normalized or "dia" in normalized or "atual" in normalized)):
        return {"supported": False, "answer": "Por enquanto, posso responder: Como estão minhas vendas hoje?",
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
