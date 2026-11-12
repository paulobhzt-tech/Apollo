"""Auto teste: one-button health check of the whole system. Each check is a small focused function."""
import os
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from lib.auth import require
from lib.db import client, db
from models.schemas import SelfTestCheck, SelfTestResult

router = APIRouter()


def _c(key: str, label: str, status: str, detail: str = "", fix: str = "") -> SelfTestCheck:
    return SelfTestCheck(key=key, label=label, status=status, detail=detail, fix=fix)  # type: ignore[arg-type]


def _hours_since(dt) -> float | None:
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600 if isinstance(dt, datetime) else None


async def check_database() -> SelfTestCheck:
    t0 = time.perf_counter()
    try:
        await client.admin.command("ping")
    except Exception as e:  # noqa: BLE001
        return _c("banco", "Banco de dados", "falha", f"Sem resposta: {type(e).__name__}")
    ms = round((time.perf_counter() - t0) * 1000)
    return _c("banco", "Banco de dados", "ok" if ms < 500 else "aviso", f"Respondendo em {ms} ms")


async def check_access() -> SelfTestCheck:
    valid_text = {"$type": "string", "$ne": ""}
    credentials = [{"pin_hash": valid_text}, {"username": valid_text, "password_hash": valid_text}]
    admins = await db.employees.count_documents(
        {"role": "admin", "active": True, "must_change_password": {"$ne": True}, "$or": credentials},
    )
    no_login = await db.employees.count_documents({"active": True, "$nor": credentials})
    detail = f"{admins} administrador(es) com acesso configurado"
    if no_login:
        detail += f" · {no_login} operador(es) ativo(s) sem credencial"
    status = "falha" if not admins else "aviso" if no_login else "ok"
    return _c("acesso", "Acesso de administrador", status, detail, "Funcionários" if status != "ok" else "")


def check_products(prods: list[dict], cats: dict) -> SelfTestCheck:
    no_price = [p["name"] for p in prods if not p.get("price")]
    no_cat = [p["name"] for p in prods if p["category_id"] not in cats]
    no_img = sum(1 for p in prods if not p.get("image"))
    status = "falha" if not prods or no_cat else ("aviso" if no_price else "ok")
    parts = [f"{len(prods)} produtos ativos em {len(cats)} categorias"]
    if no_price:
        parts.append(f"sem preço: {', '.join(no_price[:3])}")
    if no_cat:
        parts.append(f"sem categoria: {', '.join(no_cat[:3])}")
    if no_img:
        parts.append(f"{no_img} sem foto")
    return _c("produtos", "Cadastro de produtos", status, " · ".join(parts), "Cadastro de Produtos" if status != "ok" else "")


def check_environments(envs: dict, cats: dict, prods: list[dict]) -> SelfTestCheck:
    bad = [c["name"] for c in cats.values() if c.get("station") not in envs]
    bad += [p["name"] for p in prods if p.get("station") and p["station"] not in envs]
    detail = f"{len(envs)} ambientes" + (f" · com ambiente inválido: {', '.join(bad[:3])}" if bad else "")
    return _c("ambientes", "Ambientes de produção", "falha" if bad or not envs else "ok", detail, "Cadastro de Produtos → Ambientes" if bad else "")


async def check_printers(envs: dict, cats: dict, prods: list[dict]) -> SelfTestCheck:
    printers = await db.printers.find({"active": True}, {"_id": 0}).to_list(100)
    used = {c.get("station") for c in cats.values()} | {p["station"] for p in prods if p.get("station")}
    covered = {p["purpose"] for p in printers}
    missing = [envs[k]["name"] for k in used if k in envs and envs[k].get("auto_print", True) and k not in covered]
    parts = [f"{len(printers)} impressora(s) ativa(s)"]
    if missing:
        parts.append(f"sem impressora: {', '.join(missing)}")
    if "caixa" not in covered:
        parts.append("nenhuma para o caixa/cupom")
    status = "falha" if not printers else ("aviso" if len(parts) > 1 else "ok")
    return _c("impressoras", "Impressoras", status, " · ".join(parts), "Configurações → Impressoras" if status != "ok" else "")


async def check_print_queue(envs: dict) -> SelfTestCheck:
    now = datetime.now(timezone.utc)
    q = {"created_at": {"$gte": now - timedelta(hours=3), "$lte": now - timedelta(minutes=10)}, "status": "novo"}
    stuck = 0
    for t in await db.kitchen_tickets.find(q, {"_id": 0, "items": 1, "printed": 1}).to_list(300):
        need = {i["station"] for i in t["items"] if i.get("print_ticket", True) and envs.get(i["station"], {}).get("auto_print", True)}
        stuck += bool(need - set(t.get("printed", [])))
    if stuck:
        return _c("fila", "Fila de impressão", "aviso", f"{stuck} ticket(s) há mais de 10 min sem imprimir", "Abra a Central de Impressão")
    return _c("fila", "Fila de impressão", "ok", "Nenhum ticket parado")


async def check_cash() -> SelfTestCheck:
    cash = await db.cash_sessions.find_one({"status": "aberto"}, {"_id": 0, "opened_at": 1})
    if not cash:
        return _c("caixa", "Caixa", "aviso", "Caixa fechado: o PDV não recebe pagamentos", "Controle de Caixa")
    hours = _hours_since(cash.get("opened_at")) or 0
    if hours > 20:
        return _c("caixa", "Caixa", "aviso", f"Aberto há {hours:.0f}h · feche o turno anterior", "Controle de Caixa")
    return _c("caixa", "Caixa", "ok", f"Aberto há {hours:.0f}h")


async def check_stock() -> SelfTestCheck:
    low = [i["name"] for i in await db.ingredients.find({"$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0, "name": 1}).to_list(500)]
    if low:
        return _c("estoque", "Estoque de insumos", "aviso", f"{len(low)} abaixo do mínimo: {', '.join(low[:4])}", "Estoque & Insumos")
    return _c("estoque", "Estoque de insumos", "ok", "Todos acima do mínimo")


async def check_payments() -> SelfTestCheck:
    gen = await db.settings.find_one({"_id": "general"}) or {}
    fees = (await db.settings.find_one({"_id": "card_fees"}) or {}).get("fees", {})
    status = "ok" if gen.get("pix_key") and fees else "aviso"
    detail = f"PIX: {'configurado' if gen.get('pix_key') else 'sem chave'} · {len(fees)} taxa(s) de cartão"
    return _c("pagamentos", "PIX e taxas de cartão", status, detail, "Configurações → Empresa & PIX / Taxas" if status != "ok" else "")


async def check_backup() -> SelfTestCheck:
    label, fix = "Backup no Google Drive", "Configurações → Backup"
    drv = await db.settings.find_one({"_id": "drive"}) or {}
    configured = bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))
    if not configured or not drv.get("refresh_token"):
        return _c("backup", label, "aviso", "Google Drive não conectado: o backup automático não está rodando", fix)
    history = drv.get("history", [])
    last_ok = next((h for h in history if h.get("ok")), None)
    age = _hours_since(last_ok.get("at")) if last_ok else None
    status = "falha" if age is None else ("ok" if age <= 26 else "aviso")
    detail = f"Último backup há {age:.0f}h" if age is not None else "Nenhum backup enviado ainda"
    if history and history[0].get("error"):
        detail += f" · última tentativa falhou: {history[0]['error']}"
    if not drv.get("auto", True):
        detail += " · automático desligado"
        status = "aviso" if status == "ok" else status
    return _c("backup", label, status, detail, fix if status != "ok" else "")


def check_scheduler() -> SelfTestCheck:
    if os.environ.get("WEBHOOK_CRON_SECRET"):
        return _c("agendador", "Agendador noturno", "aviso", "Chave configurada. Confira o histórico de backups para validar as execuções.")
    return _c("agendador", "Agendador noturno", "falha", "Agendador sem chave de segurança")


async def _checks() -> list[SelfTestCheck]:
    db_check = await check_database()
    if db_check.status == "falha":
        return [db_check]
    prods = await db.products.find({"active": True}, {"_id": 0, "name": 1, "price": 1, "image": 1, "category_id": 1, "station": 1}).to_list(5000)
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    envs = {e["key"]: e for e in await db.environments.find({}, {"_id": 0}).to_list(200)}
    return [
        db_check, await check_access(), check_products(prods, cats), check_environments(envs, cats, prods),
        await check_printers(envs, cats, prods), await check_print_queue(envs), await check_cash(), await check_stock(),
        await check_payments(), await check_backup(), check_scheduler(),
    ]


@router.post("/selftest", response_model=SelfTestResult)
async def run_selftest(me: dict = Depends(require())):
    checks = await _checks()
    res = SelfTestResult(at=datetime.now(timezone.utc), by_name=me["name"], checks=checks,
                         ok=sum(c.status == "ok" for c in checks), warnings=sum(c.status == "aviso" for c in checks),
                         failures=sum(c.status == "falha" for c in checks))
    await db.settings.update_one({"_id": "selftest_last"}, {"$set": res.model_dump()}, upsert=True)
    return res


@router.get("/selftest/last", response_model=SelfTestResult | None)
async def last_selftest(_: dict = Depends(require())):
    return await db.settings.find_one({"_id": "selftest_last"}, {"_id": 0}) or None
