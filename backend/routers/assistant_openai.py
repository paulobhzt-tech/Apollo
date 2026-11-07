"""Optional ChatGPT integration. Only aggregated sales metrics leave the server."""
import asyncio
import json
import os
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from lib.auth import require
from lib.db import db
from lib.orders import day_bounds, local_today
from routers.assistant import sales_answer, format_sales_answer
from routers.reports import paid_between

router = APIRouter()

class ChatQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    provider: Literal["openai", "gemini", "local"] = "openai"


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

def _gemini_request(metrics: dict) -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY não configurada")
    model = os.environ.get("APOLLO_GEMINI_MODEL", "gemini-2.5-flash")
    if not model or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._" for ch in model):
        raise RuntimeError("Modelo Gemini inválido")
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text":
            "Responda à pergunta 'Como estão minhas vendas hoje?' usando apenas estes dados agregados: "
            + json.dumps(metrics, ensure_ascii=False)}]}],
        "generationConfig": {"maxOutputTokens": 500, "temperature": 0.2},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        result = json.loads(response.read(150000).decode("utf-8"))
    answer = "\n".join(
        part.get("text", "") for candidate in result.get("candidates", [])
        for part in candidate.get("content", {}).get("parts", [])
        if isinstance(part.get("text"), str)
    ).strip()
    if not answer:
        raise RuntimeError("Resposta vazia do Gemini")
    return answer

@router.post("/assistant/chat")
async def chat(payload: ChatQuestion, _: dict = Depends(require("admin", "caixa"))):
    question = payload.question.casefold().strip()
    if not (("venda" in question or "faturamento" in question or "faturei" in question)
            and ("hoje" in question or "dia" in question or "atual" in question)):
        return {"supported": False, "answer": "Por segurança, o assistente está limitado à pergunta sobre vendas de hoje.",
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
    provider = payload.provider
    if provider == "local":
        return {"supported": True, "answer": format_sales_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria", "provider": "local"}
    key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
    label = "Gemini" if provider == "gemini" else "ChatGPT"
    if not os.environ.get(key_name, "").strip():
        return {"supported": True, "answer": format_sales_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria", "provider": "local",
                "notice": f"{label} não configurado. Resposta local com dados reais."}
    try:
        provider_fn = _gemini_request if provider == "gemini" else _openai_request
        answer = await asyncio.wait_for(asyncio.to_thread(provider_fn, metrics), timeout=15)
        return {"supported": True, "answer": answer, "metrics": metrics,
                "source": "pedidos_pagos_e_meta_diaria", "provider": provider}
    except (RuntimeError, urllib.error.URLError, TimeoutError, ValueError, asyncio.TimeoutError, KeyError):
        return {"supported": True, "answer": format_sales_answer(metrics),
                "metrics": metrics, "source": "pedidos_pagos_e_meta_diaria", "provider": "local",
                "notice": f"{label} indisponível; exibindo resposta calculada pelo Apollo."}
