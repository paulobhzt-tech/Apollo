"""Optional ChatGPT integration. Only aggregated sales metrics leave the server."""
import asyncio
import json
import os
import urllib.error
import urllib.request
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from lib.auth import require
from lib.db import db
from lib.orders import day_bounds, local_today
from routers.assistant import AssistantQuestion, sales_answer, format_sales_answer
from routers.reports import paid_between

router = APIRouter()

SYSTEM = (
    "Você é o Apollo IA, assistente gerencial de um restaurante. "
    "Responda em português brasileiro de forma objetiva. "
    "Use EXCLUSIVAMENTE os números do JSON fornecido, nunca invente valores. "
    "O dia atual é parcial; não chame faturamento de lucro. "
    "Não dê instruções para alterar caixa, pedidos ou estoque. "
    "Se não houver dados, explique claramente."
)

def _openai_request(metrics: dict) -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY não configurada")
    model = os.environ.get("APOLLO_OPENAI_MODEL", "gpt-4.1-mini")
    payload = {
        "model": model,
        "store": False,
        "max_output_tokens": 350,
        "instructions": SYSTEM,
        "input": "Responda à pergunta 'Como estão minhas vendas hoje?' usando apenas estes dados agregados: "
                 + json.dumps(metrics, ensure_ascii=False),
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        result = json.loads(response.read(150000).decode("utf-8"))
    chunks = [part.get("text", "") for output in result.get("output", [])
              for part in output.get("content", []) if part.get("type") == "output_text"]
    answer = "\n".join(chunks).strip()
    if not answer:
        raise RuntimeError("Resposta vazia da API")
    return answer

@router.post("/assistant/chat")
async def chat(payload: AssistantQuestion, _: dict = Depends(require("admin", "caixa"))):
    question = payload.question.casefold().strip()
    if not (("venda" in question or "faturamento" in question or "faturei" in question)
            and ("hoje" in question or "dia" in question or "atual" in question)):
        return {"supported": False, "answer": "Por segurança, o ChatGPT está limitado à pergunta sobre vendas de hoje.",
                "metrics": None, "source": "restricao_de_escopo", "provider": "local"}
    today = local_today()
    yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    start, end = day_bounds(today)
    pstart, pend = day_bounds(yesterday)
    current = await paid_between(start, end)
    previous = await paid_between(pstart, pend)
    setting = await db.settings.find_one({"_id": "daily_sales_goal"}, {"amount": 1})
    goal = max(0.0, float((setting or {}).get("amount") or 0))
    metrics = sales_answer(today, current, previous, goal)
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        return {"supported": True, "answer": format_sales_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria", "provider": "local",
                "notice": "ChatGPT não configurado. Resposta local com dados reais."}
    try:
        answer = await asyncio.wait_for(asyncio.to_thread(_openai_request, metrics), timeout=15)
        return {"supported": True, "answer": answer, "metrics": metrics,
                "source": "pedidos_pagos_e_meta_diaria", "provider": "openai"}
    except (RuntimeError, urllib.error.URLError, TimeoutError, ValueError, asyncio.TimeoutError):
        return {"supported": True, "answer": format_sales_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria", "provider": "local",
                "notice": "ChatGPT indisponível; exibindo resposta calculada pelo Apollo."}
