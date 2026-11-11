"""Ambientes de produção (cozinha, churrasqueira, bar…) and the automatic print queue per environment."""
import re
import unicodedata
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_user, require
from lib.db import db
from lib.orders import now
from models.schemas import Environment, EnvironmentIn, KitchenTicket, OkOut, TicketPrintedIn

router = APIRouter()
DEFAULT_ENVS = [("cozinha", "Cozinha quente"), ("churrasqueira", "Churrasqueira"), ("forno", "Forno pizzaria"), ("bar", "Bar / Bebidas")]


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "ambiente"


async def ensure_environments(session=None) -> None:
    """Idempotent: default environments always exist (also keys referenced by old categories)."""
    options = {"session": session} if session is not None else {}
    for i, (key, name) in enumerate(DEFAULT_ENVS):
        if not await db.environments.find_one({"key": key}, **options):
            await db.environments.insert_one(Environment(key=key, name=name, sort=i).model_dump(), **options)


async def env_keys() -> set[str]:
    return {e["key"] for e in await db.environments.find({}, {"_id": 0, "key": 1}).to_list(200)}


@router.get("/environments", response_model=list[Environment])
async def list_envs(_: dict = Depends(current_user)):
    return await db.environments.find({}, {"_id": 0}).sort([("sort", 1), ("name", 1)]).to_list(200)


@router.post("/environments", response_model=Environment)
async def create_env(body: EnvironmentIn, _: dict = Depends(require())):
    key = slug(body.name)
    if await db.environments.find_one({"key": key}):
        raise HTTPException(400, f"Ambiente {body.name} já existe")
    e = Environment(key=key, **body.model_dump()).model_dump()
    await db.environments.insert_one(dict(e))
    return e


@router.put("/environments/{id}", response_model=Environment)
async def update_env(id: str, body: EnvironmentIn, _: dict = Depends(require())):
    res = await db.environments.find_one_and_update({"id": id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Ambiente não encontrado")
    return res


@router.delete("/environments/{id}", response_model=OkOut)
async def delete_env(id: str, _: dict = Depends(require())):
    e = await db.environments.find_one({"id": id})
    if not e:
        raise HTTPException(404, "Ambiente não encontrado")
    if await db.categories.find_one({"station": e["key"]}) or await db.products.find_one({"station": e["key"]}):
        raise HTTPException(400, "Há categorias ou produtos usando este ambiente")
    await db.environments.delete_one({"id": id})
    return OkOut()


@router.get("/print/queue", response_model=list[KitchenTicket])
async def print_queue(stations: str = Query("", description="comma-separated environment keys"), _: dict = Depends(current_user)):
    """Tickets from the last 3h with printable items for the given environments that were not printed there yet."""
    keys = [k for k in stations.split(",") if k]
    if not keys:
        return []
    q = {"created_at": {"$gte": now() - timedelta(hours=3)}, "status": {"$ne": "entregue"},
         "items": {"$elemMatch": {"station": {"$in": keys}, "print_ticket": {"$ne": False}}}}
    out = []
    for t in await db.kitchen_tickets.find(q, {"_id": 0}).sort("created_at", 1).to_list(200):
        pending = {i["station"] for i in t["items"] if i["station"] in keys and i.get("print_ticket", True)} - set(t.get("printed", []))
        if pending:
            out.append(t)
    return out


@router.get("/print/recent", response_model=list[KitchenTicket])
async def print_recent(_: dict = Depends(current_user)):
    return await db.kitchen_tickets.find({"created_at": {"$gte": now() - timedelta(hours=12)}}, {"_id": 0}).sort("created_at", -1).to_list(40)


@router.post("/kds/tickets/{id}/printed", response_model=KitchenTicket)
async def mark_printed(id: str, body: TicketPrintedIn, _: dict = Depends(current_user)):
    t = await db.kitchen_tickets.find_one_and_update({"id": id}, {"$addToSet": {"printed": body.station}}, projection={"_id": 0}, return_document=True)
    if not t:
        raise HTTPException(404, "Ticket não encontrado")
    return t
