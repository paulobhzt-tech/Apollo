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
