"""Rate-limit regression checks for public QR actions."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers import public


@pytest.mark.asyncio
async def test_qr_rate_limit_allows_normal_requests(monkeypatch):
    update = AsyncMock(return_value={"attempts": public.QR_MAX_REQUESTS})
    monkeypatch.setattr(public.db.public_qr_limits, "find_one_and_update", update)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1")
    assert update.await_count == 1
    args, kwargs = update.await_args
    assert kwargs["upsert"] is True
    assert "$inc" in args[1]


@pytest.mark.asyncio
async def test_qr_rate_limit_blocks_excess_requests(monkeypatch):
    update = AsyncMock(return_value={"attempts": public.QR_MAX_REQUESTS + 1})
    monkeypatch.setattr(public.db.public_qr_limits, "find_one_and_update", update)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    with pytest.raises(HTTPException) as error:
        await public.limit_table_actions(request, "mesa-1")
    assert error.value.status_code == 429


@pytest.mark.asyncio
async def test_qr_reads_have_separate_higher_limit(monkeypatch):
    update = AsyncMock(return_value={"attempts": public.QR_MAX_READS})
    monkeypatch.setattr(public.db.public_qr_limits, "find_one_and_update", update)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1", read_only=True)
    key = update.await_args.args[0]["_id"]
    assert key.endswith(f":{int(datetime.now(timezone.utc).timestamp()) // public.QR_WINDOW_SECONDS}")
    update.return_value = {"attempts": public.QR_MAX_READS + 1}
    with pytest.raises(HTTPException) as error:
        await public.limit_table_actions(request, "mesa-1", read_only=True)
    assert error.value.status_code == 429


@pytest.mark.asyncio
async def test_qr_read_and_write_use_distinct_buckets(monkeypatch):
    update = AsyncMock(return_value={"attempts": 1})
    monkeypatch.setattr(public.db.public_qr_limits, "find_one_and_update", update)
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1")
    write_key = update.await_args.args[0]["_id"]
    await public.limit_table_actions(request, "mesa-1", read_only=True)
    read_key = update.await_args.args[0]["_id"]
    assert read_key != write_key
