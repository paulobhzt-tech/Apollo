"""PIN-based session auth. Sessions live in db.sessions; the token rides an httpOnly cookie."""
import hashlib
import hmac
import bcrypt
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

from lib.db import db

COOKIE = "pdv_session"
SESSION_HOURS = 14


def hash_pin(pin: str) -> str:
    salt = os.environ.get("PIN_SALT", "chefcontrol-pdv")
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def secure_hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_pin(pin: str, stored: str) -> bool:
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(pin.encode(), stored.encode())
        except ValueError:
            return False
    return hmac.compare_digest(hash_pin(pin), stored)


async def create_session(employee_id: str) -> str:
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    await db.sessions.insert_one({
        "token": digest,
        "token_hash": digest,
        "employee_id": employee_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
    })
    return token


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Não autenticado")
    digest = hashlib.sha256(token.encode()).hexdigest()
    s = await db.sessions.find_one({"$or": [{"token_hash": digest}, {"token": token}]})
    if not s or s["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(401, "Sessão expirada")
    emp = await db.employees.find_one({"id": s["employee_id"], "active": True}, {"_id": 0, "pin_hash": 0, "password_hash": 0})
    if not emp:
        raise HTTPException(401, "Funcionário inativo")
    if emp.get("must_change_password") and request.url.path not in ("/auth/first-password", "/api/auth/first-password", "/auth/logout", "/api/auth/logout"):
        raise HTTPException(403, "É obrigatório alterar a senha inicial antes de usar o PDV")
    return emp


def require(*roles: str):
    """Admin always passes; otherwise the user's role must be listed."""
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] != "admin" and user["role"] not in roles:
            raise HTTPException(403, "Seu perfil não tem permissão para esta ação")
        return user
    return dep


async def cancel_authorizer(user: dict, manager_pin: str | None) -> str:
    """Name of who authorised a cancel/refund: the user, or a manager who typed their PIN."""
    if user["role"] == "admin" or user.get("can_cancel"):
        return user["name"]
    if manager_pin:
        m = await find_employee_by_pin(manager_pin)
        if m and (m["role"] == "admin" or m.get("can_cancel")):
            return m["name"]
        raise HTTPException(403, "PIN de gerente inválido ou sem autorização")
    raise HTTPException(403, "Sem autorização para cancelar ou estornar. Informe o PIN do gerente.")


async def require_cancel(user: dict = Depends(current_user)) -> dict:
    """Cancel/refund is allowed only for admin or employees the admin authorised (can_cancel)."""
    if user["role"] != "admin" and not user.get("can_cancel"):
        raise HTTPException(403, "Sem autorização para cancelar ou estornar. Solicite ao administrador.")
    return user


async def find_employee_by_pin(pin: str, active_only: bool = True) -> dict | None:
    query = {"active": True} if active_only else {}
    legacy = await db.employees.find_one({**query, "pin_hash": hash_pin(pin)}, {"_id": 0})
    if legacy:
        new_hash = secure_hash_pin(pin)
        await db.employees.update_one({"id": legacy["id"], "pin_hash": legacy["pin_hash"]}, {"$set": {"pin_hash": new_hash}})
        return {**legacy, "pin_hash": new_hash}
    async for emp in db.employees.find(query, {"_id": 0}):
        if verify_pin(pin, emp.get("pin_hash", "")):
            return emp
    return None


async def pin_in_use(pin: str, exclude_id: str | None = None) -> bool:
    legacy = await db.employees.find_one({"pin_hash": hash_pin(pin)}, {"id": 1})
    if legacy and legacy.get("id") != exclude_id:
        return True
    async for emp in db.employees.find({}, {"id": 1, "pin_hash": 1}):
        if emp.get("id") != exclude_id and verify_pin(pin, emp.get("pin_hash", "")):
            return True
    return False


async def revoke_session(token: str | None) -> None:
    if token:
        await db.sessions.delete_many({"$or": [
            {"token_hash": hashlib.sha256(token.encode()).hexdigest()},
            {"token": token},
        ]})


LOGIN_LIMIT = 5
LOGIN_WINDOW = 900


def login_key(request: Request) -> str:
    address = request.client.host if request.client else "unknown"
    bucket = int(datetime.now(timezone.utc).timestamp()) // LOGIN_WINDOW
    return f"{address}:{bucket}"


async def check_login_limit(request: Request) -> None:
    record = await db.login_attempts.find_one({"_id": login_key(request)})
    if record and record.get("attempts", 0) >= LOGIN_LIMIT:
        raise HTTPException(429, "Muitas tentativas de PIN. Tente novamente mais tarde.")


async def failed_login(request: Request) -> None:
    await db.login_attempts.update_one(
        {"_id": login_key(request)},
        {"$inc": {"attempts": 1}, "$setOnInsert": {
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30)
        }}, upsert=True,
    )


async def successful_login(request: Request) -> None:
    await db.login_attempts.delete_one({"_id": login_key(request)})
