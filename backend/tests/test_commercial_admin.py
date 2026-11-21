"""Regression tests for reseller and franchise administration."""
from unittest.mock import AsyncMock
from types import SimpleNamespace
from lib.auth import require_platform_admin
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
    monkeypatch.setattr(admin, "db", SimpleNamespace(commercial_resellers=SimpleNamespace(find_one=AsyncMock(return_value=None))))
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise(admin.FranchiseIn(name="Rede Teste", reseller_id="inativo"), {"id": "admin"})
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_unit_requires_existing_franchise(monkeypatch):
    monkeypatch.setattr(admin, "db", SimpleNamespace(commercial_franchises=SimpleNamespace(find_one=AsyncMock(return_value=None))))
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise_location("missing", admin.LocationIn(name="Loja 1"), {"id": "admin"})
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_unit_duplicate_code_rejected_within_franchise(monkeypatch):
    duplicate = AsyncMock(return_value={"id": "existing"})
    monkeypatch.setattr(admin, "db", SimpleNamespace(
        commercial_franchises=SimpleNamespace(find_one=AsyncMock(return_value={"id": "franchise-1"})),
        commercial_locations=SimpleNamespace(find_one=duplicate)))
    with pytest.raises(HTTPException) as error:
        await admin.create_franchise_location(
            "franchise-1", admin.LocationIn(name="Loja 2", external_code="store-1"), {"id": "admin"},
        )
    assert error.value.status_code == 409
    assert duplicate.await_args.args[0] == {"franchise_id": "franchise-1", "external_code": "store-1"}


def test_registry_endpoints_require_admin():
    from fastapi.routing import APIRoute
    routes = [route for route in admin.router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 6
    for route in routes:
        dependencies = [dependency.call for dependency in route.dependant.dependencies]
        assert len(dependencies) == 1
        assert dependencies[0] is require_platform_admin


@pytest.mark.asyncio
async def test_restaurant_admin_cannot_manage_platform_registry():
    with pytest.raises(HTTPException) as error:
        await require_platform_admin({"role": "admin"})
    assert error.value.status_code == 403
    assert await require_platform_admin({"role": "admin", "platform_role": "superadmin"})
