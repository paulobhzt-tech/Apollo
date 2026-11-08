"""Tests for the four commercial plans and configurable module selection."""
import pytest
from fastapi import HTTPException

from routers.commercial import MODULES, PLANS, PlanSelection, commercial_catalog, validate_selection


@pytest.mark.asyncio
async def test_catalog_exposes_four_plans_and_both_billing_cycles():
    catalog = await commercial_catalog()
    assert len(catalog["plans"]) == 4
    assert catalog["cycles"] == ["mensal", "anual"]
    assert catalog["pricing_status"] == "pendente_configuracao"


@pytest.mark.parametrize("plan", sorted(PLANS))
@pytest.mark.parametrize("cycle", ["mensal", "anual"])
def test_each_plan_supports_both_cycles_without_charging(plan, cycle):
    result = validate_selection(PlanSelection(plan=plan, cycle=cycle))
    assert result["price"] is None
    assert result["pricing_status"] == "pendente_configuracao"
    assert set(PLANS[plan][1]).issubset(result["modules"])


def test_custom_modules_are_deduplicated_against_included_plan_modules():
    quote = validate_selection(PlanSelection(plan="basico", cycle="anual", modules=["pdv", "estoque"]))
    assert quote["additional_modules"] == ["estoque"]
    assert quote["modules"] == ["estoque", "pdv"]


@pytest.mark.parametrize("data", [
    {"plan": "inexistente", "cycle": "mensal"},
    {"plan": "basico", "cycle": "semanal"},
    {"plan": "basico", "cycle": "mensal", "modules": ["inexistente"]},
    {"plan": "basico", "cycle": "mensal", "modules": ["estoque", "estoque"]},
])
def test_invalid_plan_selection_is_rejected(data):
    with pytest.raises(HTTPException) as error:
        validate_selection(PlanSelection(**data))
    assert error.value.status_code == 422


def test_franchise_plan_contains_all_registered_modules():
    result = validate_selection(PlanSelection(plan="franquias", cycle="anual"))
    assert set(result["modules"]) == set(MODULES)
