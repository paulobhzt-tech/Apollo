"""Beer keg yield and margin calculations; read-only, no inventory mutation."""
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from lib.auth import require

router = APIRouter()

class KegYieldInput(BaseModel):
    keg_liters: Decimal = Field(gt=0, le=1000, max_digits=9, decimal_places=3)
    serving_ml: int = Field(gt=0, le=5000)
    loss_pct: Decimal = Field(default=Decimal("0"), ge=0, lt=100, max_digits=5, decimal_places=2)
    keg_cost: Decimal = Field(ge=0, le=1000000, max_digits=12, decimal_places=2)
    selling_price: Decimal = Field(ge=0, le=1000000, max_digits=12, decimal_places=2)


def estimate_keg_yield(data: KegYieldInput) -> dict:
    """Conservative number of full servings after estimated losses."""
    available_ml = data.keg_liters * 1000 * (100 - data.loss_pct) / 100
    servings = int(available_ml // data.serving_ml)
    revenue = (data.selling_price * servings).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    gross_profit = revenue - data.keg_cost
    margin = ((gross_profit / revenue) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if revenue else Decimal("0")
    return {
        "estimated_servings": servings,
        "estimated_revenue": float(revenue),
        "estimated_gross_profit": float(gross_profit),
        "estimated_gross_margin_pct": float(margin),
        "note": "Estimativa; não registra vendas nem altera estoque. Não inclui impostos ou outras despesas.",
    }


@router.post("/beverages/keg/estimate")
async def estimate_keg(body: KegYieldInput, _: dict = Depends(require("caixa"))):
    return estimate_keg_yield(body)
