import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from lib.auth import current_user, require
from lib.db import db
from models.schemas import GeneralSettings, OkOut, Printer, PrinterIn, RestoreIn, RestoreOut

router = APIRouter()
from lib.backups import BACKUP_COLLS, export_backup, restore_empty
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
    return await export_backup(db)


@router.get("/backup")
async def backup(_: dict = Depends(require())):
    stamp, payload = await build_backup()
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="backup-apollo-{stamp}.json"'})


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
    counts = await restore_empty(db, body.data, body.manifest, body.format_version, me)
    return RestoreOut(counts=counts, message="Restauração integral em destino vazio concluída; valide a conciliação antes de operar")
