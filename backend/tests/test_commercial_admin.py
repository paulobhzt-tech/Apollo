"""Regression tests for reseller and franchise administration."""
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import commercial_admin as admin


def test_invalid_reseller_email_rejected():
    for email in ("invalid", "name@invalid", "with space@example.com"):
        with pytest.raises(HTTPException) as error:
            admin.normalize_email(email)
        assert error.value.status_code == 422


def test_email_normalization():
    assert admin.normalize_email("  Sales@Example.COM ") == "sales@example.com"


def test_location_code_validation():
    assert admin.ensure_code(" loja-1 ") == "loja-1"
    for code in ("", "loja/../admin", "loja com espaço"):
        with pytest.raises(HTTPException) as error:
            admin.ensure_code(code)
        assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_inactive_reseller_cannot_own_new_franchise(monkeypatch):
    monkeypatch.setattr(admin.db.commercial_resellers, "find_one", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise(admin.FranchiseIn(name="Rede Teste", reseller_id="inativo"), {"id": "admin"})
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_unit_requires_existing_franchise(monkeypatch):
    monkeypatch.setattr(admin.db.commercial_franchises, "find_one", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise_location("missing", admin.LocationIn(name="Loja 1"), {"id": "admin"})
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_unit_duplicate_code_rejected_within_franchise(monkeypatch):
    monkeypatch.setattr(admin.db.commercial_franchises, "find_one", AsyncMock(return_value={"id": "franchise-1"}))
    duplicate = AsyncMock(return_value={"id": "existing"})
    monkeypatch.setattr(admin.db.commercial_locations, "find_one", duplicate)
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise_location(
            "franchise-1", admin.LocationIn(name="Loja 2", external_code="store-1"), {"id": "admin"},
        )
    assert error.value.status_code == 409
    assert duplicate.await_args.args[0] == {"franchise_id": "franchise-1", "external_code": "store-1"}


def test_registry_endpoints_require_admin():
    from fastapi.routing import APIRoute
    from lib.auth import require
    routes = [route for route in admin.router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 6
    for route in routes:
        assert any(dependency.call.__name__ == "dep" for dependency in route.dependant.dependencies)
