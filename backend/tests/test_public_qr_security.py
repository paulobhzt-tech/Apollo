"""Rate-limit regression checks for public QR actions."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers import public


@pytest.fixture
def update(monkeypatch):
    operation = AsyncMock()
    collection = SimpleNamespace(find_one_and_update=operation)
    monkeypatch.setattr(public, "db", SimpleNamespace(public_qr_limits=collection))
    return operation


@pytest.mark.asyncio
async def test_qr_rate_limit_allows_normal_requests(update):
    update.return_value = {"attempts": public.QR_MAX_REQUESTS}
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1")
    assert update.await_count == 1
    args, kwargs = update.await_args
    assert kwargs["upsert"] is True
    assert "$inc" in args[1]


@pytest.mark.asyncio
async def test_qr_rate_limit_blocks_excess_requests(update):
    update.return_value = {"attempts": public.QR_MAX_REQUESTS + 1}
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    with pytest.raises(HTTPException) as error:
        await public.limit_table_actions(request, "mesa-1")
    assert error.value.status_code == 429


@pytest.mark.asyncio
async def test_qr_reads_have_separate_higher_limit(monkeypatch, update):
    fixed_now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(public, "datetime", SimpleNamespace(now=lambda tz: fixed_now))
    update.return_value = {"attempts": public.QR_MAX_READS}
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1", read_only=True)
    key = update.await_args.args[0]["_id"]
    bucket = int(fixed_now.timestamp()) // public.QR_WINDOW_SECONDS
    assert key.endswith(f":{bucket}")
    update.return_value = {"attempts": public.QR_MAX_READS + 1}
    with pytest.raises(HTTPException) as error:
        await public.limit_table_actions(request, "mesa-1", read_only=True)
    assert error.value.status_code == 429


@pytest.mark.asyncio
async def test_qr_read_and_write_use_distinct_buckets(update):
    update.return_value = {"attempts": 1}
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    await public.limit_table_actions(request, "mesa-1")
    write_key = update.await_args.args[0]["_id"]
    await public.limit_table_actions(request, "mesa-1", read_only=True)
    read_key = update.await_args.args[0]["_id"]
    assert read_key != write_key
