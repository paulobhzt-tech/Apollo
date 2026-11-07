"""Catalogo comercial Apollo: propostas sem ativar licencas ou gerar cobrancas.

O catalogo nao concede acesso aos recursos: provisionamento e autorizacao
por tenant devem validar as contratacoes antes de aplicar permissoes.
"""
from dataclasses import dataclass
from typing import Literal

Period = Literal["mensal", "anual"]
Plan = Literal["essencial", "basico", "profissional", "completo", "personalizado"]

@dataclass(frozen=True)
class Module:
    code: str
    label: str
    included_in_basic: bool = False

MODULES = (
    Module("pdv", "PDV e vendas", True),
    Module("mesas", "Mesas e comandas", True),
    Module("produtos", "Produtos e cadastros", True),
    Module("caixa", "Controle de caixa", True),
    Module("relatorios_basicos", "Relatorios essenciais", True),
    Module("estoque", "Estoque e ficha tecnica"),
    Module("compras", "Compras e fornecedores"),
    Module("financeiro", "Financeiro avancado"),
    Module("delivery", "Delivery e iFood"),
    Module("integracoes", "Integracoes externas"),
    Module("cardapio_digital", "Cardapio digital e QR Code"),
    Module("comanda_mobile", "Comanda Mobile"),
    Module("kds", "Cozinha KDS"),
    Module("fiscal", "Fiscal NFC-e e NF-e"),
    Module("apollo_ia", "Apollo IA"),
    Module("crm", "CRM e promocoes"),
    Module("chope", "Gestao de chope"),
    Module("multiunidades", "Multiunidades"),
    Module("relatorios_avancados", "Relatorios avancados"),
)
MODULE_BY_CODE = {module.code: module for module in MODULES}
ESSENTIAL_MODULES = frozenset({"pdv", "produtos", "caixa", "relatorios_basicos"})
BASIC_MODULES = ESSENTIAL_MODULES | {"mesas"}
PROFESSIONAL_MODULES = BASIC_MODULES | {"estoque", "financeiro", "kds", "cardapio_digital"}
CORE_MODULES = BASIC_MODULES
PLAN_MODULES = {"essencial": ESSENTIAL_MODULES, "basico": BASIC_MODULES, "profissional": PROFESSIONAL_MODULES, "completo": frozenset(MODULE_BY_CODE), "personalizado": frozenset()}
# Seguranca, backup e auditoria sao recursos obrigatorios, nao adicionais comerciais.

def build_proposal(plan: Plan, period: Period, add_ons=()):
    """Retorna a selecao comercial; nao calcula valores nem aplica permissoes."""
    if plan not in PLAN_MODULES:
        raise ValueError("Plano invalido")
    if period not in ("mensal", "anual"):
        raise ValueError("Periodicidade invalida")
    selected = tuple(add_ons)
    if len(selected) != len(set(selected)):
        raise ValueError("Modulo duplicado")
    unknown = set(selected) - MODULE_BY_CODE.keys()
    if unknown:
        raise ValueError("Modulo desconhecido")
    if plan == "personalizado" and not selected:
        raise ValueError("Selecione pelo menos um modulo")
    if set(selected) & PLAN_MODULES[plan]:
        raise ValueError("Modulo ja incluido no plano escolhido")
    enabled = PLAN_MODULES[plan] | set(selected)
    return {
        "plan": plan,
        "period": period,
        "modules": sorted(enabled),
        "add_ons": sorted(selected),
        "price_cents": None,
        "status": "rascunho",
        "notice": "Proposta comercial sem cobranca, ativacao ou liberacao automatica.",
    }
