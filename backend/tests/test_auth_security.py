"""Regression tests for employee PIN hashing and legacy PIN verification."""
from lib.auth import hash_pin, secure_hash_pin, verify_pin


def test_new_pin_is_salted_and_verifiable():
    a = secure_hash_pin("749216")
    b = secure_hash_pin("749216")
    assert a != b
    assert a.startswith("$2")
    assert verify_pin("749216", a)
    assert not verify_pin("749215", a)


def test_legacy_pin_is_accepted_for_migration():
    legacy = hash_pin("749216")
    assert verify_pin("749216", legacy)
    assert not verify_pin("749215", legacy)


def test_malformed_hash_rejected():
    assert not verify_pin("749216", "not-a-valid-hash")
    assert not verify_pin("749216", None)


import pytest
from unittest.mock import AsyncMock
from routers import auth as auth_router


@pytest.mark.asyncio
async def test_employee_audit_never_records_credentials(monkeypatch):
    insert = AsyncMock()
    from types import SimpleNamespace
    monkeypatch.setattr(auth_router, "db", SimpleNamespace(employee_audit=SimpleNamespace(insert_one=insert)))
    await auth_router.audit_employee_change(
        "updated", {"id": "admin-1"}, "employee-2",
        ["role", "active", "pin", "password", "pin_hash", "password_hash"],
    )
    entry = insert.await_args.args[0]
    assert entry["action"] == "updated"
    assert entry["actor_id"] == "admin-1"
    assert entry["employee_id"] == "employee-2"
    assert entry["fields"] == ["active", "role"]
    assert "password" not in str(entry)
    assert "pin" not in str(entry)


@pytest.mark.asyncio
async def test_pin_only_operator_can_authenticate_without_password_reset(monkeypatch):
    from types import SimpleNamespace
    from fastapi import HTTPException, Response
    from models.schemas import LoginIn

    operator = {"id": "operator-test", "name": "Operador de teste", "pin_hash": "stored"}
    employees = SimpleNamespace(find_one=AsyncMock(return_value=operator))
    monkeypatch.setattr(auth_router, "db", SimpleNamespace(employees=employees))
    monkeypatch.setattr(auth_router, "check_login_limit", AsyncMock())
    monkeypatch.setattr(auth_router, "failed_login", AsyncMock())
    monkeypatch.setattr(auth_router, "successful_login", AsyncMock())
    monkeypatch.setattr(auth_router, "find_employee_by_pin", AsyncMock(return_value=dict(operator)))
    monkeypatch.setattr(auth_router, "create_session", AsyncMock(return_value="test-session"))
    request = SimpleNamespace()

    with pytest.raises(HTTPException) as error:
        await auth_router.login(LoginIn(username=" OPERADOR ", password="fictional-test-password"),
                                Response(), request)
    assert error.value.status_code == 401
    assert error.value.detail == "Credenciais inválidas"
    employees.find_one.assert_awaited_once_with({"username": "operador", "active": True}, {"_id": 0})
    auth_router.create_session.assert_not_awaited()

    response = Response()
    result = await auth_router.login(LoginIn(pin="459142"), response, request)
    assert result == {"id": "operator-test", "name": "Operador de teste"}
    assert "HttpOnly" in response.headers["set-cookie"]


@pytest.mark.asyncio
@pytest.mark.parametrize("current_pin", ["749216", "649217"])
async def test_legacy_pin_is_rechecked_after_concurrent_credential_change(monkeypatch, current_pin):
    from types import SimpleNamespace
    from lib import auth

    before = {"id": "test", "active": True, "pin_hash": auth.hash_pin("749216")}
    current = {**before, "pin_hash": auth.secure_hash_pin(current_pin)}
    employees = SimpleNamespace(
        find_one=AsyncMock(side_effect=[before, current]),
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
    )
    monkeypatch.setattr(auth, "db", SimpleNamespace(employees=employees))
    assert await auth.find_employee_by_pin("749216", employee_id="test") == (
        current if current_pin == "749216" else None
    )
    assert employees.find_one.await_args.args[0] == {"id": "test", "active": True}
