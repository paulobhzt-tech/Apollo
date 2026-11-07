"""Supplier quotation comparison for purchasing decisions (no stock mutation)."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import require
from lib.db import db

router = APIRouter()


class SupplierQuoteIn(BaseModel):
    supplier_id: str = Field(min_length=1, max_length=120)
    ingredient_id: str = Field(min_length=1, max_length=120)
    unit_price: float = Field(gt=0, le=100000000, allow_inf_nan=False)
    minimum_qty: float = Field(default=1, gt=0, le=100000000, allow_inf_nan=False)
    delivery_days: int = Field(default=0, ge=0, le=365)
    note: str = Field(default="", max_length=500)


def compare_quotes(quotes: list[dict], requested_qty: float) -> list[dict]:
    """Compare only quotations able to fulfil the requested quantity."""
    if requested_qty <= 0:
        raise ValueError("Quantidade deve ser positiva")
    eligible = [q for q in quotes if float(q["minimum_qty"]) <= requested_qty]
    return sorted(
        [{**q, "estimated_total": round(float(q["unit_price"]) * requested_qty, 2)} for q in eligible],
        key=lambda q: (q["estimated_total"], q["delivery_days"], q["id"]),
    )


@router.post("/supplier-quotes")
async def create_supplier_quote(body: SupplierQuoteIn, user: dict = Depends(require("caixa"))):
    if not await db.suppliers.find_one({"id": body.supplier_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Fornecedor não encontrado")
    if not await db.ingredients.find_one({"id": body.ingredient_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Insumo não encontrado")
    quote = {
        "id": uuid4().hex,
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
    }
    await db.supplier_quotes.insert_one(dict(quote))
    return quote


@router.get("/supplier-quotes/compare")
async def compare_supplier_quotes(
    ingredient_id: str,
    qty: float,
    _: dict = Depends(require("caixa")),
):
    if not ingredient_id.strip():
        raise HTTPException(400, "Informe o insumo")
    from math import isfinite
    if not isfinite(qty) or not 0 < qty <= 100000000:
        raise HTTPException(400, "Quantidade inválida")
    quotes = await db.supplier_quotes.find(
        {"ingredient_id": ingredient_id}, {"_id": 0}
    ).to_list(2000)
    ranked = compare_quotes(quotes, qty)
    supplier_ids = list({q["supplier_id"] for q in ranked})
    suppliers = await db.suppliers.find(
        {"id": {"$in": supplier_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(2000)
    names = {s["id"]: s["name"] for s in suppliers}
    return {
        "ingredient_id": ingredient_id,
        "requested_qty": qty,
        "quotes": [{**q, "supplier_name": names.get(q["supplier_id"], "")} for q in ranked],
        "note": "Comparação estimada; não cria pedido nem altera estoque.",
    }
