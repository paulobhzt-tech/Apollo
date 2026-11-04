"""PIN-based session auth. Sessions live in db.sessions; the token rides an httpOnly cookie."""
import hashlib
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


async def create_session(employee_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "token": token,
        "employee_id": employee_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
    })
    return token


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Não autenticado")
    s = await db.sessions.find_one({"token": token})
    if not s or s["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(401, "Sessão expirada")
    emp = await db.employees.find_one({"id": s["employee_id"], "active": True}, {"_id": 0, "pin_hash": 0})
    if not emp:
        raise HTTPException(401, "Funcionário inativo")
    return emp


def require(*roles: str):
    """Admin always passes; otherwise the user's role must be listed."""
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] != "admin" and user["role"] not in roles:
            raise HTTPException(403, "Seu perfil não tem permissão para esta ação")
        return user
    return dep


async def require_cancel(user: dict = Depends(current_user)) -> dict:
    """Cancel/refund is allowed only for admin or employees the admin authorised (can_cancel)."""
    if user["role"] != "admin" and not user.get("can_cancel"):
        raise HTTPException(403, "Sem autorização para cancelar ou estornar. Solicite ao administrador.")
    return user
