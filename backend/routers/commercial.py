"""Commercial plan catalog (no billing or activation side effects).

Pricing is deliberately not hard-coded: reseller contracts may set prices later.
Module selections are validated before a subscription is provisioned.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from lib.trial_policy import TRIAL_DAYS

router = APIRouter(prefix="/commercial", tags=["commercial"])

MODULES = {
    "pdv": "PDV e caixa",
    "mesas": "Mesas e comandas",
    "estoque": "Estoque e ficha técnica",
    "financeiro": "Financeiro e relatórios",
    "cardapio": "Cardápio digital e QR Code",
    "garcom": "Comanda mobile",
    "delivery": "Delivery e integrações",
    "multiunidade": "Multiunidades e franquias",
}
PLANS = {
    "basico": ("Básico", ("pdv",)),
    "essencial": ("Essencial", ("pdv", "mesas", "financeiro")),
    "completo": ("Completo", ("pdv", "mesas", "estoque", "financeiro", "cardapio", "garcom", "delivery")),
    "franquias": ("Franquias", tuple(MODULES)),
    "personalizado": ("Personalizado", ()),
}
CYCLES = ("mensal", "anual")


class PlanSelection(BaseModel):
    plan: str
    cycle: str
    modules: list[str] = Field(default_factory=list, max_length=32)


def validate_selection(selection: PlanSelection) -> dict:
    if selection.plan not in PLANS:
        raise HTTPException(422, "Plano comercial inválido")
    if selection.cycle not in CYCLES:
        raise HTTPException(422, "Periodicidade inválida: escolha mensal ou anual")
    unknown = sorted(set(selection.modules) - MODULES.keys())
    if unknown:
        raise HTTPException(422, "Módulos desconhecidos: " + ", ".join(unknown))
    if len(selection.modules) != len(set(selection.modules)):
        raise HTTPException(422, "Módulos duplicados não são permitidos")
    if selection.plan == "personalizado" and not selection.modules:
        raise HTTPException(422, "Selecione pelo menos um módulo para o plano personalizado")
    included = set(PLANS[selection.plan][1])
    enabled = sorted(included | set(selection.modules))
    return {"plan": selection.plan, "cycle": selection.cycle, "modules": enabled,
            "included_modules": sorted(included), "additional_modules": sorted(set(selection.modules) - included),
            "price": None, "currency": "BRL", "pricing_status": "pendente_configuracao",
            "note": "Simulação sem cobrança, ativação de licença ou alteração de dados."}


@router.get("/catalog")
async def commercial_catalog():
    return {
        "modules": [{"key": key, "name": label} for key, label in MODULES.items()],
        "plans": [{"key": key, "name": name, "included_modules": list(modules)}
                  for key, (name, modules) in PLANS.items()],
        "cycles": list(CYCLES),
        "trial": {"enabled": False, "max_days": TRIAL_DAYS,
                  "activation_status": "pendente_integracao_licenciamento",
                  "note": "Teste gratuito de até 7 dias; ativação ainda indisponível."},
        "pricing_status": "pendente_configuracao",
        "note": "Catálogo de demonstração; não cria assinaturas nem define preços.",
    }


@router.post("/quote")
async def commercial_quote(selection: PlanSelection):
    return validate_selection(selection)
