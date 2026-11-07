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


import pytest
from unittest.mock import AsyncMock
from routers import auth as auth_router


@pytest.mark.asyncio
async def test_employee_audit_never_records_credentials(monkeypatch):
    insert = AsyncMock()
    monkeypatch.setattr(auth_router.db.employee_audit, "insert_one", insert)
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
