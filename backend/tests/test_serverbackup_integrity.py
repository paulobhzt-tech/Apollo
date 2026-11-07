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
