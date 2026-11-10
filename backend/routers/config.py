import re
import gzip
import hashlib
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from lib.auth import current_user, require
from lib.db import db
from models.schemas import GeneralSettings, OkOut, Printer, PrinterIn, RestoreIn, RestoreOut

router = APIRouter()
BACKUP_COLLS = ["employees", "suppliers", "categories", "products", "ingredients", "stock_moves", "tables", "orders", "kitchen_tickets",
                "invoices", "cash_sessions", "expenses", "fiado_customers", "customer_moves", "printers", "settings", "environments", "counters",
                "purchases", "lot_consumptions", "inventory_counts", "production_batches",
                "bills", "bill_audit", "account_categories", "payment_methods", "supplier_quotes",
                "employee_audit", "employee_time_entries", "backup_audit", "live_music_events"]
RESERVED_SETTINGS = {"drive", "selftest_last", "sync_identity"}
KEEP_ID = {"settings", "counters"}  # these use their own _id
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


@router.get("/printers", response_model=list[Printer])
async def list_printers(_: dict = Depends(current_user)):
    return await db.printers.find({}, {"_id": 0}).sort("name", 1).to_list(100)


@router.post("/printers", response_model=Printer)
async def create_printer(body: PrinterIn, _: dict = Depends(require())):
    p = Printer(**body.model_dump()).model_dump()
    await db.printers.insert_one(dict(p))
    return p


@router.put("/printers/{id}", response_model=Printer)
async def update_printer(id: str, body: PrinterIn, _: dict = Depends(require())):
    res = await db.printers.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Impressora não encontrada")
    return res


@router.delete("/printers/{id}", response_model=OkOut)
async def delete_printer(id: str, _: dict = Depends(require())):
    if not (await db.printers.delete_one({"id": id})).deleted_count:
        raise HTTPException(404, "Impressora não encontrada")
    return OkOut()


@router.get("/branding")
async def public_branding():
    """Only public branding fields; never reveal Pix keys, contact or financial settings."""
    setting = await db.settings.find_one({"_id": "general"}, {"_id": 0, "trade_name": 1, "logo_url": 1}) or {}
    return {"trade_name": setting.get("trade_name", ""), "logo_url": setting.get("logo_url", "")}


@router.get("/settings/general", response_model=GeneralSettings)
async def get_general(_: dict = Depends(current_user)):
    return {k: v for k, v in (await db.settings.find_one({"_id": "general"}) or {}).items() if k != "_id"}


@router.put("/settings/general", response_model=GeneralSettings)
async def put_general(body: GeneralSettings, _: dict = Depends(require())):
    if body.logo_url:
        parsed = urlsplit(body.logo_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise HTTPException(400, "A imagem da marca deve usar uma URL HTTPS válida")
    await db.settings.update_one({"_id": "general"}, {"$set": body.model_dump()}, upsert=True)
    return body


async def build_backup() -> tuple[str, dict]:
    """Full JSON export (products incl. images, orders, finance…). Credential hashes, sessions and installation-specific settings are excluded."""
    data = {}
    for c in BACKUP_COLLS:
        if c == "employees":
            proj = {"_id": 0, "pin_hash": 0, "password_hash": 0}
        else:
            proj = None if c in KEEP_ID else {"_id": 0}
        q = {"_id": {"$nin": sorted(RESERVED_SETTINGS)}} if c == "settings" else {}
        records = await db[c].find(q, proj).to_list(100001)
        if len(records) > 100000:
            raise HTTPException(400, f"Coleção {c} excede o limite de exportação; backup incompleto bloqueado")
        data[c] = records
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return stamp, jsonable_encoder({"app": "Apollo PDV", "created_at": stamp, "data": data})


@router.get("/backup")
async def backup(_: dict = Depends(require())):
    stamp, payload = await build_backup()
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="backup-apollo-{stamp}.json"'})


def revive(v):
    """JSON backups store datetimes as ISO strings; turn them back into datetimes so date filters keep working."""
    if isinstance(v, dict):
        # Signed audit events use canonical ISO strings. Converting their dates
        # would change signed bytes after a restore and invalidate the seal.
        return {k: x if k == "audit_events" else revive(x) for k, x in v.items()}
    if isinstance(v, list):
        return [revive(x) for x in v]
    if isinstance(v, str) and ISO.match(v):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return v
    return v


def validate_restore_data(source: dict) -> dict[str, list[dict]]:
    """Preflight the entire backup before any destructive database operation."""
    if not isinstance(source, dict):
        raise HTTPException(400, "Dados do backup inválidos")
    if not source or any(name not in BACKUP_COLLS for name in source):
        raise HTTPException(400, "Backup contém coleções desconhecidas ou está vazio")
    data = {}
    for name, docs in source.items():
        if not isinstance(docs, list) or any(not isinstance(doc, dict) for doc in docs):
            raise HTTPException(400, f"Coleção {name} deve conter uma lista de registros válidos")
        keys = [doc.get("_id") if name in KEEP_ID else doc.get("id") for doc in docs]
        present_keys = [str(key) for key in keys if key is not None]
        if len(present_keys) != len(set(present_keys)):
            raise HTTPException(400, f"Coleção {name} contém identificadores duplicados")
        data[name] = docs
    if not data.get("products") and not data.get("orders"):
        raise HTTPException(400, "Arquivo de backup inválido ou vazio")
    return data


async def save_restore_safety_snapshot(actor_id: str) -> str:
    """Persist a recovery copy before the first replacement; failure blocks restore.

    No pruning is performed here. Snapshots retain current credential hashes for
    recovery and therefore are never exposed by the sanitized export endpoint.
    """
    data = {}
    for name in BACKUP_COLLS:
        projection = None if name in KEEP_ID else {"_id": 0}
        records = await db[name].find({}, projection).to_list(100001)
        if len(records) > 100000:
            raise HTTPException(400, "Cópia de segurança excede o limite de registros; restauração bloqueada")
        data[name] = records
    raw = json.dumps(jsonable_encoder({"data": data}), ensure_ascii=False).encode()
    compressed = gzip.compress(raw)
    if len(compressed) > 15 * 1024 * 1024:
        raise HTTPException(400, "Cópia de segurança anterior à restauração excede o limite; restauração bloqueada")
    snapshot_id = str(uuid.uuid4())
    await db.restore_safety_backups.insert_one({
        "id": snapshot_id, "at": datetime.now(timezone.utc), "actor_id": actor_id,
        "blob": compressed, "sha256": hashlib.sha256(raw).hexdigest(),
    })
    return snapshot_id


@router.post("/backup/restore", response_model=RestoreOut)
async def restore(body: RestoreIn, me: dict = Depends(require())):
    """Replaces each collection present in the backup. Employees keep their current PINs (backups never carry PINs);
    employees that do not exist here are restored inactive until the admin sets a PIN. The logged-in admin is always kept."""
    data = validate_restore_data(body.data)
    if "settings" in data:  # installation identity and connections never come from a clone
        data["settings"] = [d for d in data["settings"] if d.get("_id") not in RESERVED_SETTINGS]
    if not data.get("products") and not data.get("orders"):
        raise HTTPException(400, "Arquivo de backup inválido ou vazio")
    await save_restore_safety_snapshot(me["id"])
    # A restored older snapshot must not reuse numbers already issued before it.
    prior_counters = await db.counters.find({}, {"_id": 1, "seq": 1}).to_list(1000)
    prior_order = await db.orders.find_one({}, {"_id": 0, "number": 1}, sort=[("number", -1)])
    counts: dict[str, int] = {}
    for c, docs in data.items():
        docs = [revive(d) for d in docs if isinstance(d, dict)]
        if c == "employees":
            credentials = {e["id"]: e for e in await db.employees.find(
                {}, {"_id": 0, "id": 1, "pin_hash": 1, "password_hash": 1}).to_list(1000)}
            keep = [d for d in docs if d.get("id") and d["id"] != me["id"]]
            for d in keep:
                d.pop("pin_hash", None)
                d.pop("password_hash", None)
                current = credentials.get(d["id"], {})
                for field in ("pin_hash", "password_hash"):
                    if current.get(field):
                        d[field] = current[field]
                if not current.get("pin_hash") and not current.get("password_hash"):
                    d["active"] = False
            await db.employees.delete_many({"id": {"$nin": [d["id"] for d in keep] + [me["id"]]}})
            for d in keep:
                await db.employees.replace_one({"id": d["id"]}, d, upsert=True)
            counts[c] = len(keep)
            continue
        await db[c].delete_many({"_id": {"$nin": sorted(RESERVED_SETTINGS)}} if c == "settings" else {})
        if docs:
            await db[c].insert_many(docs)
        counts[c] = len(docs)
    last = await db.orders.find_one({}, {"_id": 0, "number": 1}, sort=[("number", -1)])
    for counter in prior_counters:
        if counter.get("_id") is not None and isinstance(counter.get("seq"), int):
            await db.counters.update_one({"_id": counter["_id"]}, {"$max": {"seq": counter["seq"]}}, upsert=True)
    maximum = max(int((last or {}).get("number", 0)), int((prior_order or {}).get("number", 0)))
    if maximum:
        await db.counters.update_one({"_id": "order"}, {"$max": {"seq": maximum}}, upsert=True)
    from routers.production import ensure_environments
    await ensure_environments()
    total = sum(counts.values())
    return RestoreOut(counts=counts, message=f"Backup restaurado: {total} registros em {len(counts)} tabelas")

class BackupDestinationIn(BaseModel):
    destination: Literal["pc", "google_drive"]


@router.get("/settings/backup-destination")
async def get_backup_destination(_: dict = Depends(require("admin"))):
    doc = await db.settings.find_one({"_id": "backup_destination"}) or {}
    return {"destination": doc.get("destination"), "required": True}


@router.put("/settings/backup-destination")
async def put_backup_destination(body: BackupDestinationIn, _: dict = Depends(require("admin"))):
    if body.destination == "google_drive":
        drive = await db.settings.find_one({"_id": "drive"}) or {}
        if not drive.get("refresh_token"):
            raise HTTPException(400, "Conecte o Google Drive antes de escolhê-lo como destino obrigatório")
        if not drive.get("auto", True):
            raise HTTPException(400, "Ative o backup automático no Google Drive antes de selecioná-lo")
    await db.settings.update_one({"_id": "backup_destination"}, {"$set": {"destination": body.destination}}, upsert=True)
    return {"destination": body.destination, "required": True}
