"""Prevent restaurant administrators from accessing global commercial registries."""
import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from lib.auth import require_platform_admin
from routers import commercial_admin


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [
    {"role": "admin"},
    {"role": "admin", "platform_role": "operator"},
    {"role": "garcom", "platform_role": "superadmin"},
    {"role": "caixa", "platform_role": "superadmin"},
])
async def test_non_platform_admin_denied(user):
    with pytest.raises(HTTPException) as error:
        await require_platform_admin(user)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_explicit_platform_admin_allowed():
    user = {"role": "admin", "platform_role": "superadmin"}
    assert await require_platform_admin(user) is user


def test_all_commercial_admin_routes_require_platform_admin():
    routes = [r for r in commercial_admin.router.routes if isinstance(r, APIRoute)]
    assert len(routes) == 6
    for route in routes:
        assert any(d.call is require_platform_admin for d in route.dependant.dependencies), route.path
