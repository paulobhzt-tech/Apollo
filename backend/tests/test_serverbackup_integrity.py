"""Backup validation: reject tampering, invalid data and decompression bombs."""
import gzip
import hashlib
import json
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers import serverbackup


@pytest.mark.asyncio
async def test_load_valid_backup(monkeypatch):
    raw = json.dumps({"data": {"tables": []}}).encode()
    document = {"blob": gzip.compress(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", AsyncMock(return_value=document))
    _, payload = await serverbackup._load("backup-1")
    assert payload["data"] == {"tables": []}


@pytest.mark.asyncio
async def test_load_rejects_modified_backup(monkeypatch):
    raw = json.dumps({"data": {"tables": []}}).encode()
    document = {"blob": gzip.compress(raw), "sha256": "0" * 64}
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", AsyncMock(return_value=document))
    with pytest.raises(HTTPException) as error:
        await serverbackup._load("backup-1")
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_load_rejects_corrupt_archive(monkeypatch):
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", AsyncMock(return_value={"blob": b"invalid"}))
    with pytest.raises(HTTPException) as error:
        await serverbackup._load("backup-1")
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_load_rejects_oversized_payload(monkeypatch):
    monkeypatch.setattr(serverbackup, "MAX_UNCOMPRESSED_BYTES", 20)
    document = {"blob": gzip.compress(json.dumps({"data": {"tables": []}}).encode())}
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", AsyncMock(return_value=document))
    with pytest.raises(HTTPException) as error:
        await serverbackup._load("backup-1")
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_verify_backup_does_not_restore_or_modify_data(monkeypatch):
    raw = json.dumps({"data": {"tables": [], "orders": [{"id": "o-1"}]}}).encode()
    document = {"blob": gzip.compress(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    lookup = AsyncMock(return_value=document)
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", lookup)
    result = await serverbackup.verify_server_backup("backup-1", {"role": "admin"})
    assert result["valid"] is True
    assert result["integrity"] == "sha256"
    assert result["collections"] == ["orders", "tables"]
    assert result["record_counts"]["orders"] == 1
    assert lookup.await_count == 1


@pytest.mark.asyncio
async def test_verify_legacy_backup_reports_missing_checksum(monkeypatch):
    raw = json.dumps({"data": {"tables": []}}).encode()
    monkeypatch.setattr(serverbackup.db.server_backups, "find_one", AsyncMock(return_value={"blob": gzip.compress(raw)}))
    result = await serverbackup.verify_server_backup("backup-legacy", {"role": "admin"})
    assert result["integrity"] == "legacy_without_checksum"


@pytest.mark.asyncio
async def test_backup_audit_records_actor_and_action_without_sensitive_data(monkeypatch):
    insert = AsyncMock()
    monkeypatch.setattr(serverbackup.db.backup_audit, "insert_one", insert)
    await serverbackup.audit_backup("restored", {"id": "employee-1", "name": "Admin", "pin_hash": "secret"}, "backup-1")
    record = insert.await_args.args[0]
    assert record["action"] == "restored"
    assert record["backup_id"] == "backup-1"
    assert record["employee_id"] == "employee-1"
    assert "pin_hash" not in record


def test_restore_preflight_rejects_malformed_collections():
    from routers.config import validate_restore_data
    with pytest.raises(HTTPException) as error:
        validate_restore_data({"products": [{"id": "p1"}], "orders": "not-a-list"})
    assert error.value.status_code == 400


def test_restore_preflight_rejects_unknown_collection():
    from routers.config import validate_restore_data
    with pytest.raises(HTTPException) as error:
        validate_restore_data({"products": [{"id": "p1"}], "sessions": []})
    assert error.value.status_code == 400
