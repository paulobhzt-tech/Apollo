"""Security tests for initial admin provisioning."""
from unittest.mock import AsyncMock
from types import SimpleNamespace
import pytest
from fastapi import HTTPException, Response
from routers import auth


def request(token=None, host="127.0.0.1"):
    return SimpleNamespace(client=SimpleNamespace(host=host),
                           headers={"x-apollo-bootstrap-token": token} if token else {})


@pytest.mark.asyncio
async def test_bootstrap_disabled_without_operator_token(monkeypatch):
    monkeypatch.delenv("APOLLO_BOOTSTRAP_TOKEN", raising=False)
    with pytest.raises(HTTPException) as exc:
        await auth.first_access(auth.FirstAccessIn(username="admin", password="A_Strong_Password_2026!"),
                                Response(), request())
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_bootstrap_rejects_wrong_secret(monkeypatch):
    monkeypatch.setenv("APOLLO_BOOTSTRAP_TOKEN", "x" * 40)
    with pytest.raises(HTTPException) as exc:
        await auth.first_access(auth.FirstAccessIn(username="admin", password="A_Strong_Password_2026!"),
                                Response(), request("wrong"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_bootstrap_rejects_remote_host_even_with_valid_secret(monkeypatch):
    monkeypatch.setenv("APOLLO_BOOTSTRAP_TOKEN", "x" * 40)
    with pytest.raises(HTTPException) as exc:
        await auth.first_access(auth.FirstAccessIn(username="admin", password="A_Strong_Password_2026!"),
                                Response(), request("x" * 40, "192.0.2.20"))
    assert exc.value.status_code == 403


def test_bootstrap_requires_strong_password():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        auth.FirstAccessIn(username="admin", password="admin")


@pytest.mark.asyncio
async def test_bootstrap_stores_chosen_password_not_default(monkeypatch):
    monkeypatch.setenv("APOLLO_BOOTSTRAP_TOKEN", "x" * 40)
    inserted = AsyncMock()
    employees = SimpleNamespace(find_one=AsyncMock(return_value=None), insert_one=inserted)
    monkeypatch.setattr(auth, "db", SimpleNamespace(employees=employees))
    monkeypatch.setattr(auth, "create_session", AsyncMock(return_value="session"))
    await auth.first_access(auth.FirstAccessIn(username="admin", password="A_Strong_Password_2026!"),
                            Response(), request("x" * 40))
    record = inserted.await_args.args[0]
    assert record["password_hash"] != "admin"
    assert auth.bcrypt.checkpw(b"A_Strong_Password_2026!", record["password_hash"].encode())
    assert not auth.bcrypt.checkpw(b"admin", record["password_hash"].encode())
