"""Administrator lifecycle against the isolated standalone MongoDB in CI."""
import asyncio
from types import SimpleNamespace

import bcrypt
import pytest
from fastapi import HTTPException, Response

from lib import auth
from lib.admin_access import provision_first_admin, recover_admin_password
from lib.db import db
from models.schemas import LoginIn
from routers import auth as routes

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_standalone_provision_and_recover_legacy_admin(monkeypatch):
    if not db.name.startswith("apollo_restore_test_"):
        pytest.skip("Requer o MongoDB descartável da CI")

    legacy_pin = "749216"
    operator = {"id": "test-first-admin-operator", "name": "Operador fictício", "active": True,
                "role": "caixa", "pin_hash": auth.hash_pin(legacy_pin)}
    await db.employees.insert_one(dict(operator))
    first_password = "SenhaInicial-Ficticia-26"
    new_password = "SenhaRecuperada-Ficticia-26"
    try:
        attempts = await asyncio.gather(
            provision_first_admin(db, "Primeiro fictício", "teste-admin", first_password),
            provision_first_admin(db, "Segundo fictício", "outro-admin", first_password),
            return_exceptions=True,
        )
        administrators = [result for result in attempts if isinstance(result, dict)]
        assert len(administrators) == 1, attempts
        admin_id = administrators[0]["id"]
        assert (await db.employees.find_one({"id": operator["id"]}, {"_id": 0})) == operator

        # Simulate an administrator migrated from a PIN-only installation.
        await db.employees.update_one({"id": admin_id},
            {"$unset": {"username": "", "password_hash": ""},
             "$set": {"pin_hash": auth.hash_pin("648319")}})
        account = await db.employees.find_one({"id": admin_id})
        old_token = await auth.create_session(admin_id)
        assert (await auth.current_user(SimpleNamespace(cookies={auth.COOKIE: old_token})))["id"] == admin_id

        await recover_admin_password(db, account, "admin-recuperado", new_password)
        with pytest.raises(HTTPException) as stale:
            await auth.current_user(SimpleNamespace(cookies={auth.COOKIE: old_token}))
        assert stale.value.status_code == 401
        recovered = await db.employees.find_one({"id": admin_id})
        assert recovered["pin_hash"] == account["pin_hash"]
        assert recovered["name"] == account["name"]
        assert bcrypt.checkpw(new_password.encode(), recovered["password_hash"].encode())
        assert recovered["admin_access_audit"][0]["action"] == "password_recovered_on_server"
        with pytest.raises(ValueError, match="conta mudou"):
            await recover_admin_password(db, account, "admin-recuperado", first_password)
        with pytest.raises(ValueError, match="Já existe"):
            await provision_first_admin(db, "Outro fictício", "novo-admin", first_password)

        async def noop(_request):
            pass

        for hook in ("check_login_limit", "failed_login", "successful_login"):
            monkeypatch.setattr(routes, hook, noop)
        request = SimpleNamespace(cookies={})
        with pytest.raises(HTTPException) as wrong:
            await routes.login(LoginIn(pin=legacy_pin, employee_id=admin_id), Response(), request)
        assert wrong.value.status_code == 401
        logged_in = await routes.login(LoginIn(pin=legacy_pin, employee_id=operator["id"]), Response(), request)
        assert logged_in["id"] == operator["id"]
        assert (await db.employees.find_one({"id": operator["id"]}))["pin_hash"].startswith("$2")
        response = Response()
        logged_in = await routes.login(LoginIn(username="ADMIN-RECUPERADO", password=new_password), response, request)
        assert logged_in["id"] == admin_id
        token = response.headers["set-cookie"].split(";", 1)[0].split("=", 1)[1]
        assert (await auth.current_user(SimpleNamespace(cookies={auth.COOKIE: token})))["id"] == admin_id
    finally:
        test_ids = [operator["id"]]
        created = await db.employees.find_one({"_id": "apollo-initial-administrator", "name": {"$in": ["Primeiro fictício", "Segundo fictício"]}})
        if created:
            test_ids.append(created["id"])
        await db.sessions.delete_many({"employee_id": {"$in": test_ids}})
        await db.employees.delete_many({"id": {"$in": test_ids}})
