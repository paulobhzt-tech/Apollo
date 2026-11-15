"""Credential work must not run on the ASGI event-loop thread."""
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import Response
from starlette.requests import Request
from lib import auth
from routers import auth as routes
from models.schemas import LoginIn, EmployeeIn

class Cursor:
    def __aiter__(self):
        async def iterate():
            yield {"id": "synthetic", "pin_hash": "$2b$synthetic"}
        return iterate()

@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["lookup", "unique", "legacy", "password", "create"])
async def test_bcrypt_runs_outside_event_loop(monkeypatch, operation):
    loop_thread = threading.get_ident()
    calls = []
    def checked(*args, **kwargs):
        calls.append(threading.get_ident())
        return True
    def hashed(*args, **kwargs):
        calls.append(threading.get_ident())
        return "$2b$synthetic"
    employees = SimpleNamespace(find_one=AsyncMock(return_value=None), find=lambda *a, **k: Cursor(),
                                update_one=AsyncMock(), insert_one=AsyncMock())
    monkeypatch.setattr(auth, "db", SimpleNamespace(employees=employees))
    monkeypatch.setattr(routes, "db", SimpleNamespace(employees=employees))
    monkeypatch.setattr(auth, "verify_pin", checked)
    monkeypatch.setattr(auth, "secure_hash_pin", hashed)
    monkeypatch.setattr(routes, "secure_hash_pin", hashed)
    monkeypatch.setattr(routes.bcrypt, "checkpw", checked)
    if operation == "lookup":
        await auth.find_employee_by_pin("123456")
    elif operation == "unique":
        await auth.pin_in_use("123456")
    elif operation == "legacy":
        employees.find_one.return_value = {"id": "synthetic", "pin_hash": "legacy"}
        await auth.find_employee_by_pin("123456")
    elif operation == "password":
        employees.find_one.return_value = {"id": "synthetic", "password_hash": "synthetic"}
        monkeypatch.setattr(routes, "check_login_limit", AsyncMock())
        monkeypatch.setattr(routes, "successful_login", AsyncMock())
        monkeypatch.setattr(routes, "create_session", AsyncMock(return_value="synthetic-token"))
        await routes.login(LoginIn(username="test", password="synthetic-password"), Response(),
                           Request({"type": "http", "headers": []}))
    else:
        monkeypatch.setattr(routes, "_pin_free", AsyncMock())
        await routes.create_employee(EmployeeIn(name="Synthetic", role="caixa", pin="123456"), {})
    assert calls
    assert all(thread != loop_thread for thread in calls), "bcrypt blocked the request event loop"
