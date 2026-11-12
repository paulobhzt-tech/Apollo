"""Administrator provisioning shared by the local CLI and protected bootstrap."""
import re
import secrets
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from lib.auth import secure_hash_pin
from models.schemas import Employee

FIRST_ADMIN_ID = "apollo-initial-administrator"


def admin_password_hash(password: str) -> str:
    if len(password) < 12 or len(password.encode()) > 72 or password.casefold() in {
        "admin123", "123456789012", "administrador",
    }:
        raise ValueError("Escolha uma senha de pelo menos 12 caracteres e até 72 bytes, sem padrões previsíveis.")
    return secure_hash_pin(password)


def normalize_admin_username(username: str) -> str:
    value = username.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", value):
        raise ValueError("Informe um usuário de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).")
    return value


async def provision_first_admin(db, name: str, username: str, password: str, pin_hash: str | None = None) -> dict:
    username = normalize_admin_username(username)
    if await db.employees.find_one({"$or": [{"role": "admin"}, {"username": username}]}, {"_id": 1}):
        raise ValueError("Já existe um administrador cadastrado ou o usuário está em uso.")
    employee = Employee(name=name, role="admin", can_cancel=True).model_dump()
    record = {**employee, "_id": FIRST_ADMIN_ID, "username": username,
              "password_hash": admin_password_hash(password), "must_change_password": False}
    if pin_hash is not None:
        record["pin_hash"] = pin_hash
    try:
        await db.employees.insert_one(record)
    except DuplicateKeyError as exc:
        raise ValueError("O primeiro administrador já foi configurado.") from exc
    return employee


async def recover_admin_password(db, employee: dict, username: str, password: str) -> None:
    username = normalize_admin_username(username)
    if employee.get("username") and username != employee["username"]:
        raise ValueError("Informe o nome de usuário já cadastrado.")
    if await db.employees.find_one({"username": username, "id": {"$ne": employee["id"]}}, {"_id": 1}):
        raise ValueError("Usuário já cadastrado para outro operador.")
    credential_version = secrets.token_hex(16)
    result = await db.employees.update_one(
        {"id": employee["id"], "role": "admin", "active": True,
         "username": employee.get("username"), "password_hash": employee.get("password_hash"),
         "credential_version": employee.get("credential_version")},
        {"$set": {"username": username, "password_hash": admin_password_hash(password),
                  "credential_version": credential_version, "must_change_password": False},
         "$push": {"admin_access_audit": {"at": datetime.now(timezone.utc),
                                          "action": "password_recovered_on_server"}}},
    )
    if result.modified_count != 1:
        raise ValueError("A conta mudou durante a recuperação. Confira os dados e tente novamente.")
