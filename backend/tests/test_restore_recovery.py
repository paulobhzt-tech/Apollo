import gzip
import hashlib
import json

import pytest

from lib.restore_recovery import inspect_restore_snapshot


def snapshot(data):
    raw = json.dumps({"data": data}).encode()
    return {"blob": gzip.compress(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def test_valid_snapshot_reports_only_safe_metadata():
    assert inspect_restore_snapshot(snapshot({"products": [{"id": "p"}], "employees": [{"password_hash": "secret"}]})) == {
        "verified": True, "collections": 2, "records": 2,
    }


def test_corrupt_hash_fails_closed():
    item = snapshot({"products": [{"id": "p"}]})
    item["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="SHA256"):
        inspect_restore_snapshot(item)


def test_corrupt_compressed_blob_fails_closed():
    item = snapshot({"products": [{"id": "p"}]})
    item["blob"] = b"broken"
    with pytest.raises(ValueError, match="comprimida"):
        inspect_restore_snapshot(item)


@pytest.mark.parametrize("data", [{}, {"products": "wrong"}, {"products": [None]}])
def test_invalid_structure_fails_closed(data):
    with pytest.raises(ValueError):
        inspect_restore_snapshot(snapshot(data))


def test_missing_metadata_fails_closed():
    with pytest.raises(ValueError):
        inspect_restore_snapshot({"blob": b"irrelevant"})

@pytest.mark.asyncio
async def test_recovery_listing_returns_metadata_only(monkeypatch):
    from types import SimpleNamespace
    from routers import config
    from unittest.mock import MagicMock

    record = {"id": "123", "at": "now", "sha256": "a" * 64}
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = __import__("unittest.mock", fromlist=["AsyncMock"]).AsyncMock(return_value=[record])
    collection = SimpleNamespace(find=MagicMock(return_value=cursor))
    monkeypatch.setattr(config, "db", SimpleNamespace(restore_safety_backups=collection))
    assert await config.recovery_snapshots({"id": "admin"}) == {"snapshots": [record]}
    projection = collection.find.call_args.args[1]
    assert projection["id"] == 1 and "blob" not in projection and "password_hash" not in projection


@pytest.mark.asyncio
async def test_inspection_does_not_restore_or_expose_snapshot(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from routers import config

    item = snapshot({"employees": [{"password_hash": "secret"}]})
    collection = SimpleNamespace(find_one=AsyncMock(return_value=item))
    monkeypatch.setattr(config, "db", SimpleNamespace(restore_safety_backups=collection))
    identifier = "12345678-1234-1234-1234-123456789abc"
    result = await config.inspect_recovery_snapshot(identifier, {"id": "admin"})
    assert result == {"snapshot_id": identifier, "verified": True, "collections": 1, "records": 1, "restored": False}
    assert "secret" not in str(result)


@pytest.mark.asyncio
async def test_inspection_rejects_invalid_identifier_without_database_access(monkeypatch):
    from types import SimpleNamespace
    from routers import config
    from fastapi import HTTPException

    monkeypatch.setattr(config, "db", SimpleNamespace())
    with pytest.raises(HTTPException) as exc:
        await config.inspect_recovery_snapshot("../other", {"id": "admin"})
    assert exc.value.status_code == 400
