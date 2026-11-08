"""Authorization and activation safety tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from routers import platform_trials


@pytest.mark.asyncio
@pytest.mark.parametrize("user", [
    {"role": "admin"}, {"role": "garcom", "platform_role": "superadmin"},
    {"role": "admin", "platform_role": "operator"},
])
async def test_restaurant_admin_cannot_activate_trial(user):
    with pytest.raises(HTTPException) as exc:
        await platform_trials.platform_operator(user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_only_explicit_platform_superadmin_passes():
    user = {"role": "admin", "platform_role": "superadmin"}
    assert await platform_trials.platform_operator(user) == user


@pytest.mark.asyncio
async def test_missing_signing_key_fails_before_database_write(monkeypatch):
    monkeypatch.delenv("APOLLO_LICENSE_PRIVATE_KEY", raising=False)
    monkeypatch.setattr(platform_trials, "issue_trial", AsyncMock())
    body = platform_trials.ManualTrialRequest(verified_customer_id="customer-1", installation_id="installation-123")
    with pytest.raises(HTTPException) as exc:
        await platform_trials.activate_trial(body, {"role": "admin", "platform_role": "superadmin"})
    assert exc.value.status_code == 503
    platform_trials.issue_trial.assert_not_awaited()


def test_activation_route_requires_platform_operator():
    from fastapi.routing import APIRoute
    routes = [r for r in platform_trials.router.routes if isinstance(r, APIRoute)]
    assert len(routes) == 2
    for route in routes:
        assert any(dep.call is platform_trials.platform_operator for dep in route.dependant.dependencies)
