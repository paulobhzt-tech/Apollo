"""Monetary receipts on an open table and their cash register entries."""
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

from lib.cash_scope import independent_cash


def cents(value) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def require_receipt_transaction(session):
    if session is None or not independent_cash():
        raise HTTPException(409, "Recebimentos por valor exigem caixa por operador e MongoDB transacional.")


def guard_open_receipts(order):
    if order.get("advance_paid", 0) > 0:
        raise HTTPException(409, "Estorne os recebimentos parciais antes de alterar os itens ou cancelar a conta.")


def pix_references(payments):
    return {
        (p.get("details") or {}).get("reference", "").strip().casefold()
        for p in payments if p["method"] == "pix" and (p.get("details") or {}).get("reference")
    }
