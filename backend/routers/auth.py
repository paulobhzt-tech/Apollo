import os
import bcrypt
import secrets
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
    password: str


@router.post("/auth/first-access", response_model=Employee)
async def first_access(body: FirstAccessIn, response: Response, request: Request):
    """One-time local-only bootstrap. Never expose predictable credentials publicly."""
    if request.client is None or request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "Primeiro acesso permitido apenas no computador servidor")
    if body.username != "admin" or body.password != "admin":
        raise HTTPException(401, "Credenciais iniciais inválidas")
    if await db.employees.count_documents({}, limit=1):
        raise HTTPException(409, "Administrador inicial já configurado")
    pin = f"{secrets.randbelow(900000) + 100000:06d}"
    emp = Employee(name="Administrador", role="admin", can_cancel=True).model_dump()
    try:
        await db.employees.insert_one({**emp, "username": "admin",
            "password_hash": secure_hash_pin("admin"), "pin_hash": secure_hash_pin(pin),
            "must_change_password": True})
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
async def _pin_free(pin: str, exclude_id: str | None = None) -> None:
    if await pin_in_use(pin, exclude_id):
        raise HTTPException(400, "Este PIN já está em uso por outro funcionário")


@router.get("/employees", response_model=list[Employee])
async def list_employees(_: dict = Depends(require())):
    return await db.employees.find({}, {"_id": 0, "pin_hash": 0, "password_hash": 0}).sort("name", 1).to_list(500)


@router.post("/employees", response_model=Employee)
async def create_employee(body: EmployeeIn, _: dict = Depends(require())):
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
    return res


@router.delete("/employees/{id}", response_model=OkOut)
async def delete_employee(id: str, user: dict = Depends(require())):
    if id == user["id"]:
        raise HTTPException(400, "Você não pode excluir seu próprio usuário")
    res = await db.employees.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Funcionário não encontrado")
    await db.sessions.delete_many({"employee_id": id})
    return OkOut()
