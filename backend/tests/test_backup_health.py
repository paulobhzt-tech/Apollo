"""Read-only backup health uses metadata, never backup blobs or database writes."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from lib.auth import current_user
from routers import serverbackup


@pytest.fixture
def health_context(monkeypatch):
    lookup = AsyncMock(return_value=None)
    settings = AsyncMock(return_value={"auto": True, "keep": 14})
    # Deliberately no update/insert/delete methods: mutations would fail the test.
    monkeypatch.setattr(serverbackup, "db", SimpleNamespace(
        server_backups=SimpleNamespace(find_one=lookup),
        settings=SimpleNamespace(find_one=settings),
    ))
    app = FastAPI()
    app.include_router(serverbackup.router)
    app.dependency_overrides[current_user] = lambda: {"id": "admin-test", "role": "admin"}
    return app, lookup, settings


async def get_health(app, suffix=""):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/backups/server/health" + suffix)


@pytest.mark.asyncio
async def test_missing_backup_is_overdue_without_reading_blob(health_context):
    app, lookup, _ = health_context
    response = await get_health(app)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "missing"
    assert body["overdue"] is True
    assert body["latest"] is None
    assert body["last_verified_at"] is None
    args = lookup.await_args
    projection = args.args[1]
    assert projection.get("blob") is None
    assert projection["at"] == 1
    assert args.kwargs["sort"] == [("at", -1)]


@pytest.mark.asyncio
async def test_recent_backup_reports_metadata_without_claiming_verified(health_context):
    app, lookup, _ = health_context
    lookup.return_value = {"id": "recent", "at": datetime.now(timezone.utc) - timedelta(hours=2),
                           "size_kb": 512, "sha256": "a" * 64}
    body = (await get_health(app)).json()
    assert body["status"] == "recent"
    assert body["overdue"] is False
    assert body["latest"]["size_kb"] == 512
    assert 1.99 <= body["latest"]["age_hours"] <= 2.01
    assert body["latest"]["checksum_available"] is True
    assert body["integrity"] == "not_checked"
    assert "sha256" not in body["latest"]


@pytest.mark.asyncio
async def test_overdue_legacy_backup_reports_disabled_automation_and_threshold(health_context):
    app, lookup, settings = health_context
    settings.return_value = {"auto": False, "keep": 7}
    lookup.return_value = {"id": "old", "at": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=30), "size_kb": 12}
    body = (await get_health(app, "?overdue_hours=24")).json()
    assert body["status"] == "overdue"
    assert body["overdue"] is True
    assert body["auto_enabled"] is False
    assert body["keep"] == 7
    assert body["overdue_hours"] == 24
    assert body["latest"]["checksum_available"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("timestamp", ["not-a-date", datetime.now(timezone.utc) + timedelta(hours=2)])
async def test_invalid_metadata_is_not_reported_as_recent(health_context, timestamp):
    app, lookup, _ = health_context
    lookup.return_value = {"id": "invalid", "at": timestamp}
    body = (await get_health(app)).json()
    assert body["status"] == "invalid_metadata"
    assert body["overdue"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["caixa", "garcom", "cozinha"])
async def test_health_route_requires_admin_before_database_read(health_context, role):
    app, lookup, settings = health_context
    app.dependency_overrides[current_user] = lambda: {"role": role}
    response = await get_health(app)
    assert response.status_code == 403
    lookup.assert_not_awaited()
    settings.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("threshold", [0, 721, "invalid"])
async def test_invalid_threshold_rejected_without_database_read(health_context, threshold):
    app, lookup, _ = health_context
    response = await get_health(app, f"?overdue_hours={threshold}")
    assert response.status_code == 422
    lookup.assert_not_awaited()
