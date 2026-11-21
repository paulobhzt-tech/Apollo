"""Operator-scoped cash registers. Enable explicitly after closing legacy shifts."""
import os
from fastapi import HTTPException

def independent_cash():
    return os.environ.get("APOLLO_CASH_MODE", "shared") == "operator"

def cash_scope(user):
    if not independent_cash():
        return {}
    operator_id = (user or {}).get("id")
    if not operator_id:
        raise HTTPException(403, "Operador identificado obrigatório para selecionar o caixa.")
    return {"operator_id": operator_id}

async def prepare_cash_mode():
    """Fail closed before serving requests; never assign an unowned legacy shift."""
    from lib.db import db
    from pymongo.errors import OperationFailure
    if not independent_cash():
        if await db.cash_sessions.find_one({"status": "aberto", "opened_by_id": {"$type": "string"}}):
            raise RuntimeError("Feche os caixas independentes antes de voltar ao modo compartilhado.")
        return
    topology = await db.command("hello")
    if not (topology.get("setName") or topology.get("msg") == "isdbgrid"):
        raise RuntimeError("Caixas independentes exigem MongoDB com transações.")
    if await db.cash_sessions.find_one({"status": "aberto", "$or": [
            {"opened_by_id": {"$exists": False}}, {"opened_by_id": None}]}):
        raise RuntimeError("Feche o turno compartilhado antes de ativar caixas independentes.")
    await db.cash_sessions.create_index([("status", 1), ("opened_by_id", 1)],
        name="open_cash_per_operator", unique=True, partialFilterExpression={"status": "aberto"})
    try:
        await db.cash_sessions.drop_index("single_open_cash")
    except OperationFailure as error:
        if error.code != 27:
            raise

async def claim_cash(cash, *, session=None):
    """A transactional write conflicts with simultaneous closing of this shift."""
    if not independent_cash():
        return
    from lib.db import db
    if session is None:
        raise HTTPException(503, "Operação financeira exige transação; nenhuma cobrança registrada.")
    result = await db.cash_sessions.update_one(
        {"id": cash["id"], "status": "aberto", "opened_by_id": cash["opened_by_id"]},
        {"$inc": {"financial_revision": 1}}, session=session)
    if result.modified_count != 1:
        raise HTTPException(409, "Caixa fechado durante a operação. Confira o recebimento.")
