from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from lib import sync_identity
from models.schemas import SyncContext


@pytest.fixture
def settings(monkeypatch):
    collection = SimpleNamespace(find_one_and_update=AsyncMock(return_value={"server_id": "installation-a"}))
    monkeypatch.setattr(sync_identity, "db", SimpleNamespace(settings=collection))
    return collection


@pytest.mark.asyncio
async def test_identity_is_server_assigned_and_keeps_legacy_deployment_compatible(settings):
    result = await sync_identity.sync_context({"id": "cashier"})
    assert result == {"server_id": "installation-a", "establishment_id": "installation-a", "operator_id": "cashier"}
    query, change = settings.find_one_and_update.await_args.args
    assert query == {"_id": "sync_identity"}
    assert list(change) == ["$setOnInsert"]


@pytest.mark.asyncio
async def test_tenant_identity_comes_from_authenticated_user(settings):
    assert (await sync_identity.sync_context({"id": "cashier", "tenant_id": "restaurant-a"}))["establishment_id"] == "restaurant-a"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["server_id", "operator_id", "establishment_id"])
async def test_foreign_scope_rejected_before_business_processing(settings, field):
    original = await sync_identity.sync_context({"id": "cashier"})
    original[field] = "other"
    with pytest.raises(HTTPException) as error:
        await sync_identity.validate_sync_context(SyncContext(**original), {"id": "cashier"})
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_older_clients_without_scope_do_not_require_identity_write(settings):
    await sync_identity.validate_sync_context(None, {"id": "cashier"})
    settings.find_one_and_update.assert_not_awaited()
