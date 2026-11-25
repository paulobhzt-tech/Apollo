"""Store-scoped pull protocol for an explicitly enrolled Windows terminal."""

import hashlib
import hmac
import secrets
from datetime import datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from lib.auth import require
from lib.db import db
from lib.orders import now
from models.schemas import OkOut, PrintResultIn, TicketPrintedIn
from routers.production import record_print_result, reserve_print

router = APIRouter(prefix="/print-agents")
bearer = HTTPBearer(auto_error=False)


class TerminalIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    printer_id: str = Field(min_length=1, max_length=100)


class TerminalStatus(BaseModel):
    id: str
    name: str
    station: str
    printer_id: str
    active: bool
    last_seen: datetime | None = None


class EnrolledTerminal(TerminalStatus):
    token: str


class AgentPoll(BaseModel):
    queue: str = Field(min_length=1, max_length=1024)


class AgentResult(TicketPrintedIn):
    attempt_id: str = Field(min_length=1, max_length=64)
    outcome: Literal["spooler_accepted", "indeterminate"]


def token_hash(secret: str):
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


async def authenticated_terminal(auth: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if auth and len(auth.credentials) <= 100:
        terminal_id, _, secret = auth.credentials.partition(".")
        terminal = await db.print_agents.find_one({"_id": terminal_id, "active": True})
        if terminal and secret and hmac.compare_digest(terminal["token_hash"], token_hash(secret)):
            return terminal
    raise HTTPException(401, "Terminal de impressão não autorizado.", headers={"WWW-Authenticate": "Bearer"})


@router.get("", response_model=list[TerminalStatus])
async def list_terminals(_: dict = Depends(require())):
    return await db.print_agents.find({}, {"_id": 0, "token_hash": 0}).sort("created_at", -1).to_list(200)


@router.post("", response_model=EnrolledTerminal, status_code=201)
async def enroll_terminal(body: TerminalIn, response: Response, user: dict = Depends(require())):
    printer = await db.printers.find_one({"id": body.printer_id, "active": True, "paper": "80mm"})
    if not body.name.strip() or not printer or not printer.get("device_name", "").strip():
        raise HTTPException(422, "Escolha uma fila Windows ativa de 80 mm e informe o nome do terminal.")
    station = printer["purpose"]
    if not await db.environments.find_one({"key": station, "auto_print": {"$ne": False}}):
        raise HTTPException(422, "Escolha uma impressora vinculada a um setor com impressão automática.")
    terminal_id, secret = uuid4().hex, secrets.token_urlsafe(32)
    data = {"id": terminal_id, "name": body.name.strip(), "station": station, "printer_id": printer["id"],
            "active": True, "created_at": now(), "created_by": user["id"]}
    await db.print_agents.insert_one({"_id": terminal_id, **data, "token_hash": token_hash(secret)})
    response.headers["Cache-Control"] = "no-store"
    return {**data, "token": f"{terminal_id}.{secret}"}


@router.post("/{id}/revoke", response_model=OkOut)
async def revoke_terminal(id: str, user: dict = Depends(require())):
    result = await db.print_agents.update_one(
        {"_id": id, "active": True}, {"$set": {"active": False, "revoked_by": user["id"], "revoked_at": now()}},
    )
    if not result.matched_count:
        raise HTTPException(404, "Terminal ativo não encontrado.")
    return OkOut()


@router.post("/jobs/next")
async def next_job(body: AgentPoll, response: Response, terminal: dict = Depends(authenticated_terminal)):
    response.headers["Cache-Control"] = "no-store"
    seen = await db.print_agents.update_one({"_id": terminal["id"], "active": True}, {"$set": {"last_seen": now()}})
    if not seen.matched_count:
        raise HTTPException(401, "Terminal revogado.")
    station = terminal["station"]
    printer = await db.printers.find_one(
        {"id": terminal["printer_id"], "purpose": station, "active": True, "paper": "80mm"},
    )
    env = await db.environments.find_one({"key": station, "auto_print": {"$ne": False}})
    if not printer or printer.get("device_name") != body.queue or not env:
        raise HTTPException(409, "Fila de 80 mm ou setor não disponível. Revise o vínculo no Apollo.")
    query = {
        "created_at": {"$gte": terminal["created_at"]},
        "status": {"$ne": "entregue"},
        "printed": {"$ne": station},
        "print_attempts.station": {"$ne": station},
        "items": {"$elemMatch": {"station": station, "print_ticket": {"$ne": False}}},
    }
    ticket = await db.kitchen_tickets.find_one(query, sort=[("created_at", 1), ("_id", 1)])
    if not ticket:
        return None
    try:
        attempt = await reserve_print(ticket["id"], TicketPrintedIn(station=station), {"id": f"print-agent:{terminal['id']}"})
    except HTTPException as error:
        if error.status_code == 409:
            return None
        raise
    # Plain receipt data only. The agent never evaluates HTML, scripts or commands.
    lines = [env["name"], ticket["label"], f"Pedido #{ticket['order_number']}"]
    for item in ticket["items"]:
        if item["station"] != station or item.get("print_ticket") is False:
            continue
        lines.extend([f"{item['qty']}x {item['name']}", *item.get("options", [])])
        if item.get("notes"):
            lines.append(f"OBS: {item['notes']}")
    return {"ticket_id": ticket["id"], "attempt_id": attempt.id, "station": station,
            "queue": printer["device_name"], "copies": max(1, min(5, printer.get("copies", 1))), "lines": lines}


@router.post("/jobs/{id}/result", response_model=OkOut)
async def agent_result(id: str, body: AgentResult, terminal: dict = Depends(authenticated_terminal)):
    if terminal["station"] != body.station:
        raise HTTPException(403, "Setor indisponível para este terminal.")
    await record_print_result(id, PrintResultIn(**body.model_dump()), {"id": f"print-agent:{terminal['id']}"})
    return OkOut()
