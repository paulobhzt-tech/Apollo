from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from lib.auth import current_user, require
from lib.db import db
from models.schemas import GeneralSettings, OkOut, Printer, PrinterIn

router = APIRouter()
BACKUP_COLLS = ["employees", "categories", "products", "ingredients", "stock_moves", "tables", "orders", "kitchen_tickets",
                "invoices", "cash_sessions", "expenses", "fiado_customers", "customer_moves", "printers", "settings"]


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


@router.get("/backup")
async def backup(_: dict = Depends(require())):
    """Full JSON export (products incl. images, orders, finance…). PIN hashes and sessions are excluded."""
    data = {}
    for c in BACKUP_COLLS:
        proj = {"_id": 0, "pin_hash": 0} if c == "employees" else (None if c == "settings" else {"_id": 0})
        data[c] = await db[c].find({}, proj).to_list(100000)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return JSONResponse(jsonable_encoder({"app": "Espeteria Churras Buguer", "created_at": stamp, "data": data}),
                        headers={"Content-Disposition": f'attachment; filename="backup-espeteria-{stamp}.json"'})
