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
