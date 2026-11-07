"""Catalogo comercial Apollo: propostas sem ativar licencas ou gerar cobrancas.

O catalogo nao concede acesso aos recursos: provisionamento e autorizacao
por tenant devem validar as contratacoes antes de aplicar permissoes.
"""
from dataclasses import dataclass
from typing import Literal

Period = Literal["mensal", "anual"]
Plan = Literal["basico", "completo"]

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
    Module("financeiro", "Financeiro avancado"),
    Module("delivery", "Delivery e iFood"),
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
CORE_MODULES = frozenset(m.code for m in MODULES if m.included_in_basic)
# Seguranca, backup e auditoria sao recursos obrigatorios, nao adicionais comerciais.

def build_proposal(plan: Plan, period: Period, add_ons=()):
    """Retorna a selecao comercial; nao calcula valores nem aplica permissoes."""
    if plan not in ("basico", "completo"):
        raise ValueError("Plano invalido")
    if period not in ("mensal", "anual"):
        raise ValueError("Periodicidade invalida")
    selected = tuple(add_ons)
    if len(selected) != len(set(selected)):
        raise ValueError("Modulo duplicado")
    unknown = set(selected) - MODULE_BY_CODE.keys()
    if unknown:
        raise ValueError("Modulo desconhecido")
    if plan == "completo" and selected:
        raise ValueError("Plano completo ja inclui todos os modulos")
    if plan == "basico" and set(selected) & CORE_MODULES:
        raise ValueError("Modulo ja incluido no plano basico")
    enabled = set(MODULE_BY_CODE) if plan == "completo" else CORE_MODULES | set(selected)
    return {
        "plan": plan,
        "period": period,
        "modules": sorted(enabled),
        "add_ons": sorted(selected),
        "price_cents": None,
        "status": "rascunho",
        "notice": "Proposta comercial sem cobranca, ativacao ou liberacao automatica.",
    }
