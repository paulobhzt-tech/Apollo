"""Financeiro: categorias de contas, contas a pagar / a receber e formas de pagamento."""
import calendar
import hashlib
from uuid import NAMESPACE_URL, uuid5

from pymongo.errors import DuplicateKeyError
import re
import unicodedata
from datetime import date, timedelta, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_user, require
from lib.orders import local_today
from lib.db import db
from models.schemas import (AccountCategory, AccountCategoryIn, Bill, BillAlerts, BillIn, BillPayIn, BillSummary, OkOut,
                            PaymentMethodCfg, PaymentMethodIn)

router = APIRouter()

BUILTIN_METHODS = [("dinheiro", "Dinheiro", "dinheiro"), ("credito", "Crédito", "cartao"), ("debito", "Débito", "cartao"),
                   ("pix", "PIX", "pix"), ("fiado", "Fiado", "fiado")]
DEFAULT_CATS = [("Fornecedores", "pagar"), ("Aluguel", "pagar"), ("Energia / Água / Gás", "pagar"), ("Salários", "pagar"),
                ("Impostos", "pagar"), ("Manutenção", "pagar"), ("Eventos / Encomendas", "receber"), ("Outras receitas", "receber")]


def _slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "forma"


async def ensure_finance_defaults() -> None:
    """Idempotent: builtin payment methods and starter account categories always exist."""
    for i, (key, name, kind) in enumerate(BUILTIN_METHODS):
        if not await db.payment_methods.find_one({"key": key}):
            await db.payment_methods.insert_one(PaymentMethodCfg(key=key, name=name, kind=kind, builtin=True, sort=i).model_dump())
    if not await db.account_categories.count_documents({}):
        await db.account_categories.insert_many([AccountCategory(name=n, kind=k).model_dump() for n, k in DEFAULT_CATS])


# ---------- formas de pagamento ----------
@router.get("/payment-methods", response_model=list[PaymentMethodCfg])
async def list_methods(_: dict = Depends(current_user)):
    return await db.payment_methods.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(200)


@router.post("/payment-methods", response_model=PaymentMethodCfg)
async def create_method(body: PaymentMethodIn, _: dict = Depends(require())):
    key = _slug(body.name)
    if await db.payment_methods.find_one({"key": key}) or key in ("voucher", "online"):
        raise HTTPException(400, f"A forma {body.name} já existe")
    m = PaymentMethodCfg(key=key, kind="outro", **body.model_dump()).model_dump()
    await db.payment_methods.insert_one(dict(m))
    return m


@router.put("/payment-methods/{id}", response_model=PaymentMethodCfg)
async def update_method(id: str, body: PaymentMethodIn, _: dict = Depends(require())):
    m = await db.payment_methods.find_one({"id": id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Forma de pagamento não encontrada")
    upd = body.model_dump()
    if m["builtin"]:
        upd = {"active": body.active, "sort": body.sort}  # builtins keep their name; card fees live in the brand table
        if m["key"] == "dinheiro" and not body.active:
            raise HTTPException(400, "Dinheiro não pode ser desativado (é usado para troco e caixa)")
    return await db.payment_methods.find_one_and_update({"id": id}, {"$set": upd}, projection={"_id": 0}, return_document=True)


@router.delete("/payment-methods/{id}", response_model=OkOut)
async def delete_method(id: str, _: dict = Depends(require())):
    m = await db.payment_methods.find_one({"id": id})
    if not m:
        raise HTTPException(404, "Forma de pagamento não encontrada")
    if m["builtin"]:
        raise HTTPException(400, "Formas padrão não podem ser apagadas, apenas desativadas")
    await db.payment_methods.delete_one({"id": id})
    return OkOut(message="Forma de pagamento apagada")


# ---------- categorias de contas ----------
@router.get("/account-categories", response_model=list[AccountCategory])
async def list_cats(_: dict = Depends(require("caixa"))):
    return await db.account_categories.find({}, {"_id": 0}).sort([("kind", 1), ("name", 1)]).to_list(500)


@router.post("/account-categories", response_model=AccountCategory)
async def create_cat(body: AccountCategoryIn, _: dict = Depends(require())):
    if await db.account_categories.find_one({"name": body.name, "kind": body.kind}):
        raise HTTPException(400, "Categoria já existe")
    c = AccountCategory(**body.model_dump()).model_dump()
    await db.account_categories.insert_one(dict(c))
    return c


@router.put("/account-categories/{id}", response_model=AccountCategory)
async def update_cat(id: str, body: AccountCategoryIn, _: dict = Depends(require())):
    c = await db.account_categories.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not c:
        raise HTTPException(404, "Categoria não encontrada")
    await db.bills.update_many({"category_id": id}, {"$set": {"category_name": body.name}})
    return c


@router.delete("/account-categories/{id}", response_model=OkOut)
async def delete_cat(id: str, _: dict = Depends(require())):
    if await db.bills.find_one({"category_id": id, "status": "aberto"}):
        raise HTTPException(400, "Há contas em aberto nesta categoria")
    if not (await db.account_categories.delete_one({"id": id})).deleted_count:
        raise HTTPException(404, "Categoria não encontrada")
    return OkOut(message="Categoria apagada")


# ---------- contas a pagar / receber ----------
async def audit_bill_change(action: str, actor: dict, bill: dict) -> None:
    """Keep a minimal, immutable audit event for financial status changes."""
    await db.bill_audit.insert_one({
        "at": datetime.now(timezone.utc),
        "action": action,
        "actor_id": actor.get("id", ""),
        "bill_id": bill["id"],
        "kind": bill.get("kind", ""),
        "status": bill["status"],
    })


@router.get("/bills/audit")
async def list_bill_audit(_: dict = Depends(require())):
    return await db.bill_audit.find({}, {"_id": 0}).sort("at", -1).to_list(200)



def _add_months(d: str, n: int) -> str:
    y, m, day = map(int, d.split("-"))
    m0 = m - 1 + n
    y, m = y + m0 // 12, m0 % 12 + 1
    return date(y, m, min(day, calendar.monthrange(y, m)[1])).isoformat()


@router.get("/bills", response_model=list[Bill])
async def list_bills(kind: str = Query("pagar", pattern="^(pagar|receber)$"), status: str = Query("", pattern="^(|aberto|pago|cancelado)$"),
                     start: str = "", end: str = "", _: dict = Depends(require("caixa"))):
    q: dict = {"kind": kind}
    if status:
        q["status"] = status
    if start or end:
        q["due_date"] = {k: v for k, v in (("$gte", start), ("$lte", end)) if v}
    return await db.bills.find(q, {"_id": 0}).sort([("status", 1), ("due_date", 1)]).to_list(5000)


@router.get("/bills/summary", response_model=BillSummary)
async def bills_summary(_: dict = Depends(require("caixa"))):
    today = local_today()
    out = {"pagar_aberto": 0.0, "pagar_vencido": 0.0, "pagar_hoje": 0.0, "receber_aberto": 0.0, "receber_vencido": 0.0}
    for b in await db.bills.find({"status": "aberto"}, {"_id": 0, "kind": 1, "amount": 1, "due_date": 1}).to_list(10000):
        out[f"{b['kind']}_aberto"] += b["amount"]
        if b["due_date"] < today:
            out[f"{b['kind']}_vencido"] += b["amount"]
        if b["kind"] == "pagar" and b["due_date"] == today:
            out["pagar_hoje"] += b["amount"]
    fiado = await db.fiado_customers.aggregate([{"$group": {"_id": None, "t": {"$sum": "$balance"}}}]).to_list(1)
    return BillSummary(**{k: round(v, 2) for k, v in out.items()}, fiado_aberto=round(fiado[0]["t"], 2) if fiado else 0)


@router.get("/bills/alerts", response_model=BillAlerts)
async def bills_alerts(_: dict = Depends(require("caixa"))):
    """Painel: open bills overdue, due today and due tomorrow (tomorrow = WhatsApp reminder for the owner)."""
    today = local_today()
    tomorrow = (date.fromisoformat(today) + timedelta(days=1)).isoformat()
    bills = await db.bills.find({"status": "aberto", "due_date": {"$lte": tomorrow}}, {"_id": 0}).sort("due_date", 1).to_list(1000)
    gen = await db.settings.find_one({"_id": "general"}) or {}
    return BillAlerts(today=today, tomorrow_date=tomorrow, overdue=[b for b in bills if b["due_date"] < today],
                      due_today=[b for b in bills if b["due_date"] == today], due_tomorrow=[b for b in bills if b["due_date"] == tomorrow],
                      alert_phone=gen.get("alert_phone", ""))


async def _category_name(cid: str, kind: str) -> str:
    if not cid:
        return ""
    c = await db.account_categories.find_one({"id": cid})
    if not c or c["kind"] != kind:
        raise HTTPException(400, "Categoria inválida para este tipo de conta")
    return c["name"]


@router.post("/bills", response_model=list[Bill])
async def create_bill(body: BillIn, user: dict = Depends(require())):
    cname = await _category_name(body.category_id, body.kind)
    data = body.model_dump(exclude={"repeat_months", "client_ref"})
    fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    try:
        dates = [_add_months(body.due_date, i) for i in range(body.repeat_months)]
    except ValueError as error:
        raise HTTPException(400, "Data de vencimento inválida.") from error
    out = []
    for i, due_date in enumerate(dates):
        desc = body.description if body.repeat_months == 1 else f"{body.description} ({i + 1}/{body.repeat_months})"
        b = Bill(**{**data, "description": desc, "due_date": due_date}, category_name=cname, created_by=user["name"]).model_dump()
        if body.client_ref:
            bill_id = str(uuid5(NAMESPACE_URL, f"apollo:bill:{user['id']}:{body.client_ref}:{i}"))
            b["id"] = bill_id
            existing = await db.bills.find_one({"id": bill_id}, {"_id": 0})
            if existing is None:
                try:
                    await db.bills.update_one({"_id": bill_id}, {"$setOnInsert": {**b, "creation_fingerprint": fingerprint}}, upsert=True)
                except DuplicateKeyError:
                    pass
                existing = await db.bills.find_one({"_id": bill_id}, {"_id": 0})
            b = existing
            if not b or b.get("creation_fingerprint") != fingerprint:
                raise HTTPException(409, "Referência já usada com outros dados. Confira as contas registradas.")
        else:
            await db.bills.insert_one(dict(b))
        out.append(b)
    return out


@router.put("/bills/{id}", response_model=Bill)
async def update_bill(id: str, body: BillIn, _: dict = Depends(require())):
    b = await db.bills.find_one({"id": id})
    if not b:
        raise HTTPException(404, "Conta não encontrada")
    if b["status"] != "aberto":
        raise HTTPException(400, "Só contas em aberto podem ser editadas")
    upd = {**body.model_dump(exclude={"repeat_months", "client_ref"}), "category_name": await _category_name(body.category_id, body.kind)}
    # Recheck status atomically: payment/cancellation may occur after the initial read.
    updated = await db.bills.find_one_and_update(
        {"id": id, "status": "aberto"}, {"$set": upd}, projection={"_id": 0}, return_document=True,
    )
    if not updated:
        raise HTTPException(409, "Conta já baixada ou cancelada. Atualize a lista.")
    return updated


@router.post("/bills/{id}/pay", response_model=Bill)
async def pay_bill(id: str, body: BillPayIn, user: dict = Depends(require("caixa"))):
    """Atomically settle an open bill; a concurrent payment cannot settle it twice."""
    updated = await db.bills.find_one_and_update(
        {"id": id, "status": "aberto"},
        {"$set": {"status": "pago", **body.model_dump()}},
        projection={"_id": 0}, return_document=True,
    )
    if updated:
        await audit_bill_change("paid", user, updated)
        return updated
    existing = await db.bills.find_one({"id": id}, {"_id": 0, "status": 1})
    if not existing:
        raise HTTPException(404, "Conta não encontrada")
    raise HTTPException(409, "Conta já baixada ou cancelada. Atualize a lista.")


@router.post("/bills/{id}/reopen", response_model=Bill)
async def reopen_bill(id: str, user: dict = Depends(require())):
    updated = await db.bills.find_one_and_update(
        {"id": id, "status": {"$in": ["pago", "cancelado"]}},
        {"$set": {"status": "aberto", "paid_date": None, "paid_amount": 0, "payment_method": ""}},
        projection={"_id": 0}, return_document=True,
    )
    if not updated:
        raise HTTPException(409, "Conta inexistente ou já aberta. Atualize a lista.")
    await audit_bill_change("reopened", user, updated)
    return updated


@router.post("/bills/{id}/cancel", response_model=Bill)
async def cancel_bill(id: str, user: dict = Depends(require())):
    b = await db.bills.find_one_and_update({"id": id, "status": "aberto"}, {"$set": {"status": "cancelado"}}, projection={"_id": 0}, return_document=True)
    if not b:
        raise HTTPException(400, "Só contas em aberto podem ser canceladas")
    await audit_bill_change("cancelled", user, b)
    return b


@router.delete("/bills/{id}", response_model=OkOut)
async def delete_bill(id: str, _: dict = Depends(require())):
    # Never erase settled financial records or their audit trail.
    deleted = await db.bills.delete_one({"id": id, "status": "aberto"})
    if deleted.deleted_count:
        return OkOut(message="Conta apagada")
    existing = await db.bills.find_one({"id": id}, {"_id": 0, "status": 1})
    if not existing:
        raise HTTPException(404, "Conta não encontrada")
    raise HTTPException(409, "Conta paga ou cancelada não pode ser apagada; preserve o histórico financeiro.")
