import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from lib.auth import current_user, require
from lib.db import db
from models.schemas import GeneralSettings, OkOut, Printer, PrinterIn, RestoreIn, RestoreOut

router = APIRouter()
BACKUP_COLLS = ["employees", "categories", "products", "ingredients", "stock_moves", "tables", "orders", "kitchen_tickets",
                "invoices", "cash_sessions", "expenses", "fiado_customers", "customer_moves", "printers", "settings", "environments", "counters"]
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


@router.get("/settings/general", response_model=GeneralSettings)
async def get_general(_: dict = Depends(current_user)):
    return {k: v for k, v in (await db.settings.find_one({"_id": "general"}) or {}).items() if k != "_id"}


@router.put("/settings/general", response_model=GeneralSettings)
async def put_general(body: GeneralSettings, _: dict = Depends(require())):
    await db.settings.update_one({"_id": "general"}, {"$set": body.model_dump()}, upsert=True)
    return body


async def build_backup() -> tuple[str, dict]:
    """Full JSON export (products incl. images, orders, finance…). PIN hashes, sessions and Drive tokens are excluded."""
    data = {}
    for c in BACKUP_COLLS:
        if c == "employees":
            proj = {"_id": 0, "pin_hash": 0}
        else:
            proj = None if c in KEEP_ID else {"_id": 0}
        q = {"_id": {"$nin": ["drive", "selftest_last"]}} if c == "settings" else {}
        data[c] = await db[c].find(q, proj).to_list(100000)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return stamp, jsonable_encoder({"app": "Espeteria Churras Buguer", "created_at": stamp, "data": data})


@router.get("/backup")
async def backup(_: dict = Depends(require())):
    stamp, payload = await build_backup()
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="backup-espeteria-{stamp}.json"'})


def revive(v):
    """JSON backups store datetimes as ISO strings; turn them back into datetimes so date filters keep working."""
    if isinstance(v, dict):
        return {k: revive(x) for k, x in v.items()}
    if isinstance(v, list):
        return [revive(x) for x in v]
    if isinstance(v, str) and ISO.match(v):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return v
    return v


@router.post("/backup/restore", response_model=RestoreOut)
async def restore(body: RestoreIn, me: dict = Depends(require())):
    """Replaces each collection present in the backup. Employees keep their current PINs (backups never carry PINs);
    employees that do not exist here are restored inactive until the admin sets a PIN. The logged-in admin is always kept."""
    data = {k: v for k, v in body.data.items() if k in BACKUP_COLLS}
    if "settings" in data:  # never overwrite the Google Drive connection of this install
        data["settings"] = [d for d in data["settings"] if isinstance(d, dict) and d.get("_id") != "drive"]
    if not data.get("products") and not data.get("orders"):
        raise HTTPException(400, "Arquivo de backup inválido ou vazio")
    counts: dict[str, int] = {}
    for c, docs in data.items():
        docs = [revive(d) for d in docs if isinstance(d, dict)]
        if c == "employees":
            pins = {e["id"]: e.get("pin_hash") for e in await db.employees.find({}, {"_id": 0, "id": 1, "pin_hash": 1}).to_list(1000)}
            keep = [d for d in docs if d.get("id")]
            for d in keep:
                d.pop("pin_hash", None)
                if pins.get(d["id"]):
                    d["pin_hash"] = pins[d["id"]]
                else:
                    d["active"] = False
            await db.employees.delete_many({"id": {"$nin": [d["id"] for d in keep] + [me["id"]]}})
            for d in keep:
                await db.employees.replace_one({"id": d["id"]}, d, upsert=True)
            counts[c] = len(keep)
            continue
        await db[c].delete_many({"_id": {"$ne": "drive"}} if c == "settings" else {})
        if docs:
            await db[c].insert_many(docs)
        counts[c] = len(docs)
    last = await db.orders.find_one({}, {"_id": 0, "number": 1}, sort=[("number", -1)])
    if last:  # never reuse order numbers even if the backup had no counters
        await db.counters.update_one({"_id": "order"}, {"$max": {"seq": int(last["number"])}}, upsert=True)
    from routers.production import ensure_environments
    await ensure_environments()
    total = sum(counts.values())
    return RestoreOut(counts=counts, message=f"Backup restaurado: {total} registros em {len(counts)} tabelas")
