import os
import bcrypt
import secrets
import hmac
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Response, Request

from lib.auth import (COOKIE, SESSION_HOURS, create_session, current_user, secure_hash_pin, require,
                      find_employee_by_pin, pin_in_use, revoke_session,
                      check_login_limit, failed_login, successful_login)
from lib.db import db
from models.schemas import Employee, EmployeeIn, EmployeeUpdate, LoginIn, OkOut, Profile

router = APIRouter()


@router.get("/auth/profiles", response_model=list[Profile])
async def profiles():
    return await db.employees.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(200)


class FirstAccessIn(BaseModel):
    username: str
    password: str = Field(min_length=12, max_length=128)


@router.post("/auth/first-access", response_model=Employee)
async def first_access(body: FirstAccessIn, response: Response, request: Request):
    """One-time local-only bootstrap. Never expose predictable credentials publicly."""
    if request.client is None or request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "Primeiro acesso permitido apenas no computador servidor")
    # Bootstrap is disabled unless an operator explicitly sets a one-time secret.
    # Never accept hard-coded/default credentials, even on localhost.
    expected = os.environ.get("APOLLO_BOOTSTRAP_TOKEN", "")
    supplied = request.headers.get("x-apollo-bootstrap-token", "")
    if len(expected) < 32 or not supplied or not hmac.compare_digest(expected, supplied):
        raise HTTPException(403, "Configuração inicial não autorizada")
    if body.username.strip().lower() != "admin" or body.password.lower() in ("admin", "admin123", "123456789012"):
        raise HTTPException(422, "Informe administrador e senha inicial forte")
    if await db.employees.count_documents({}, limit=1):
        raise HTTPException(409, "Administrador inicial já configurado")
    pin = f"{secrets.randbelow(900000) + 100000:06d}"
    emp = Employee(name="Administrador", role="admin", can_cancel=True).model_dump()
    try:
        await db.employees.insert_one({**emp, "username": "admin",
            "password_hash": secure_hash_pin(body.password), "pin_hash": secure_hash_pin(pin),
            "must_change_password": False})
    except Exception:
        raise HTTPException(409, "Não foi possível criar o administrador inicial")
    token = await create_session(emp["id"])
    response.set_cookie(COOKIE, token, httponly=True,
        secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        samesite="lax", max_age=SESSION_HOURS * 3600, path="/")
    return emp


class FirstPasswordChangeIn(BaseModel):
    password: str = Field(min_length=12, max_length=128)


@router.post("/auth/first-password", response_model=OkOut)
async def first_password(body: FirstPasswordChangeIn, user: dict = Depends(current_user)):
    if not user.get("must_change_password"):
        raise HTTPException(409, "Troca inicial de senha não necessária")
    if body.password.lower() in ("admin", "admin123", "123456789012"):
        raise HTTPException(400, "Escolha uma senha diferente da inicial")
    await db.employees.update_one({"id": user["id"], "must_change_password": True},
        {"$set": {"password_hash": secure_hash_pin(body.password),
                  "must_change_password": False}})
    return OkOut(message="Senha inicial alterada")


@router.post("/auth/login", response_model=Employee)
async def login(body: LoginIn, response: Response, request: Request):
    await check_login_limit(request)
    emp = None
    if body.username and body.password:
        candidate = await db.employees.find_one({"username": body.username.strip().lower(), "active": True}, {"_id": 0})
        if candidate and candidate.get("password_hash"):
            try:
                if bcrypt.checkpw(body.password.encode(), candidate["password_hash"].encode()):
                    emp = candidate
            except ValueError:
                pass
    elif body.pin:
        emp = await find_employee_by_pin(body.pin)
    if not emp:
        await failed_login(request)
        raise HTTPException(401, "Credenciais inválidas")
    if emp.get("must_change_password"):
        raise HTTPException(403, "Troque a senha inicial no computador servidor antes de entrar")
    await successful_login(request)
    emp.pop("pin_hash", None)
    emp.pop("password_hash", None)
    emp.pop("_id", None)
    token = await create_session(emp["id"])
    response.set_cookie(COOKIE, token, httponly=True, secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false", samesite="lax", max_age=SESSION_HOURS * 3600, path="/")
    return emp


@router.post("/auth/logout", response_model=OkOut)
async def logout(response: Response, request: Request):
    await revoke_session(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return OkOut()


@router.get("/auth/me", response_model=Employee)
async def me(user: dict = Depends(current_user)):
    return user


# ---------- employees (admin) ----------
async def audit_employee_change(action: str, actor: dict, employee_id: str, fields: list[str] | None = None) -> None:
    """Audit metadata only; never record PINs, passwords or their hashes."""
    safe_fields = sorted(set(fields or []) - {"pin", "password", "pin_hash", "password_hash"})
    await db.employee_audit.insert_one({
        "at": datetime.now(timezone.utc),
        "action": action,
        "actor_id": actor.get("id", ""),
        "employee_id": employee_id,
        "fields": safe_fields,
    })


@router.get("/employees/audit")
async def employee_audit_log(_: dict = Depends(require())):
    return await db.employee_audit.find({}, {"_id": 0}).sort("at", -1).to_list(200)



async def _pin_free(pin: str, exclude_id: str | None = None) -> None:
    if await pin_in_use(pin, exclude_id):
        raise HTTPException(400, "Este PIN já está em uso por outro funcionário")


@router.get("/employees", response_model=list[Employee])
async def list_employees(_: dict = Depends(require())):
    return await db.employees.find({}, {"_id": 0, "pin_hash": 0, "password_hash": 0}).sort("name", 1).to_list(500)


@router.post("/employees", response_model=Employee)
async def create_employee(body: EmployeeIn, actor: dict = Depends(require())):
    await _pin_free(body.pin)
    data = body.model_dump()
    pin = data.pop("pin")
    username = (data.pop("username", None) or "").strip().lower()
    password = data.pop("password", None)
    if username:
        if not password:
            raise HTTPException(400, "Informe uma senha para o novo usuário")
        if await db.employees.find_one({"username": username}):
            raise HTTPException(400, "Usuário já cadastrado")
    elif password:
        raise HTTPException(400, "Informe o nome de usuário")
    emp = Employee(**data).model_dump()
    await db.employees.insert_one({**emp, "pin_hash": secure_hash_pin(pin), **({"username": username, "password_hash": secure_hash_pin(password)} if username and password else {})})
    await audit_employee_change("created", actor, emp["id"], list(data.keys()))
    return emp


@router.put("/employees/{id}", response_model=Employee)
async def update_employee(id: str, body: EmployeeUpdate, user: dict = Depends(require())):
    data = body.model_dump(exclude_none=True)
    username = data.pop("username", None)
    password = data.pop("password", None)
    if username is not None:
        username = username.strip().lower()
        if not username:
            raise HTTPException(400, "O nome de usuário não pode ficar vazio")
        if await db.employees.find_one({"username": username, "id": {"$ne": id}}):
            raise HTTPException(400, "Usuário já cadastrado")
        data["username"] = username
    if password:
        existing = await db.employees.find_one({"id": id}, {"username": 1})
        if not existing:
            raise HTTPException(404, "Funcionário não encontrado")
        if not (username or existing.get("username")):
            raise HTTPException(400, "Informe o nome de usuário antes de definir senha")
        data["password_hash"] = secure_hash_pin(password)
    if "pin" in data:
        pin = data.pop("pin")
        await _pin_free(pin, id)
        data["pin_hash"] = secure_hash_pin(pin)
    if id == user["id"] and (data.get("active") is False or data.get("role", "admin") != "admin"):
        raise HTTPException(400, "Você não pode desativar ou rebaixar seu próprio usuário")
    res = await db.employees.find_one_and_update({"id": id}, {"$set": data}, projection={"_id": 0, "pin_hash": 0, "password_hash": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Funcionário não encontrado")
    if "pin_hash" in data or "password_hash" in data or "username" in data or "role" in data or data.get("active") is False:
        await db.sessions.delete_many({"employee_id": id})
    await audit_employee_change("updated", user, id, list(data.keys()))
    return res


@router.delete("/employees/{id}", response_model=OkOut)
async def delete_employee(id: str, user: dict = Depends(require())):
    if id == user["id"]:
        raise HTTPException(400, "Você não pode excluir seu próprio usuário")
    res = await db.employees.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Funcionário não encontrado")
    await db.sessions.delete_many({"employee_id": id})
    await audit_employee_change("deleted", user, id)
    return OkOut()


def worked_minutes(start: datetime, end: datetime) -> int:
    """Whole elapsed minutes in UTC; reject invalid or reversed intervals."""
    if start.tzinfo is None or end.tzinfo is None or end < start:
        raise ValueError("Intervalo de ponto inválido")
    return int((end - start).total_seconds() // 60)


@router.get("/employees/time-clock/me")
async def my_time_clock(user: dict = Depends(current_user)):
    emp = await db.employees.find_one({"id": user["id"]}, {"_id": 0, "clock_in_at": 1})
    return {"clocked_in": bool(emp and emp.get("clock_in_at")), "clock_in_at": emp.get("clock_in_at") if emp else None}


@router.post("/employees/time-clock/in")
async def clock_in(user: dict = Depends(current_user)):
    timestamp = datetime.now(timezone.utc)
    res = await db.employees.update_one(
        {"id": user["id"], "active": True, "clock_in_at": {"$exists": False}},
        {"$set": {"clock_in_at": timestamp}})
    if not res.modified_count:
        raise HTTPException(409, "Ponto já aberto ou funcionário inativo")
    return {"clocked_in": True, "clock_in_at": timestamp}


@router.post("/employees/time-clock/out")
async def clock_out(user: dict = Depends(current_user)):
    from pymongo import ReturnDocument
    emp = await db.employees.find_one_and_update(
        {"id": user["id"], "clock_in_at": {"$exists": True}},
        {"$unset": {"clock_in_at": ""}},
        projection={"_id": 0, "id": 1, "name": 1, "clock_in_at": 1},
        return_document=ReturnDocument.BEFORE)
    if not emp:
        raise HTTPException(409, "Nenhum ponto aberto")
    timestamp = datetime.now(timezone.utc)
    minutes = worked_minutes(emp["clock_in_at"], timestamp)
    record = {"employee_id": user["id"], "employee_name": emp["name"],
              "clock_in_at": emp["clock_in_at"], "clock_out_at": timestamp, "minutes": minutes}
    await db.employee_time_entries.insert_one(dict(record))
    return {"clocked_in": False, "entry": record}


@router.get("/employees/time-clock/report")
async def time_clock_report(start: str, end: str, _: dict = Depends(require())):
    from datetime import date
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "Datas inválidas")
    if first > last or (last - first).days > 366:
        raise HTTPException(400, "Período inválido ou superior a 366 dias")
    from lib.orders import day_bounds
    begin, _ = day_bounds(start)
    _, finish = day_bounds(end)
    entries = await db.employee_time_entries.find(
        {"clock_out_at": {"$gte": begin, "$lt": finish}}, {"_id": 0}).sort("clock_out_at", -1).to_list(10000)
    totals = {}
    for entry in entries:
        key = entry["employee_id"]
        row = totals.setdefault(key, {"employee_id": key, "employee_name": entry["employee_name"], "minutes": 0, "shifts": 0})
        row["minutes"] += entry["minutes"]
        row["shifts"] += 1
    return {"entries": entries, "totals": sorted(totals.values(), key=lambda x: x["employee_name"]),
            "note": "Registro operacional de turnos completos; não calcula horas extras, intervalos ou folha de pagamento."}
