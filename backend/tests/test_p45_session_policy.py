"""Session duration avoids calendar-day logout; expiry and server-side revocation remain enforced."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from starlette.requests import Request
from fastapi import HTTPException
from lib import auth

@pytest.mark.parametrize("raw,expected",[(None,168),("14",14),("1",1),("720",720)])
def test_configured_session_duration(monkeypatch,raw,expected):
    if raw is None:
        monkeypatch.delenv("APOLLO_SESSION_HOURS",raising=False)
    else:
        monkeypatch.setenv("APOLLO_SESSION_HOURS",raw)
    assert auth.configured_session_hours()==expected

@pytest.mark.parametrize("raw",["0","721","seven",""])
def test_invalid_session_policy_fails_closed(monkeypatch,raw):
    monkeypatch.setenv("APOLLO_SESSION_HOURS",raw)
    with pytest.raises(RuntimeError):
        auth.configured_session_hours()

@pytest.mark.asyncio
async def test_same_operator_session_survives_next_day_then_expires_or_revokes(monkeypatch):
    start=datetime(2026,11,21,12,tzinfo=timezone.utc)
    clock={"at":start}
    class Clock:
        @staticmethod
        def now(tz=None):
            return clock["at"]
    saved={}
    async def insert(doc):
        saved.update(doc)
    sessions=SimpleNamespace(insert_one=AsyncMock(side_effect=insert),find_one=AsyncMock(side_effect=lambda query:saved or None))
    employee={"id":"p45-session-user","name":"Fictitious operator","role":"caixa","active":True,"credential_version":"v1"}
    monkeypatch.setattr(auth,"db",SimpleNamespace(sessions=sessions,employees=SimpleNamespace(find_one=AsyncMock(return_value=employee))))
    monkeypatch.setattr(auth,"datetime",Clock)
    monkeypatch.setattr(auth,"SESSION_HOURS",168)
    token=await auth.create_session(employee["id"],"v1")
    assert saved["expires_at"]==start+timedelta(days=7)
    request=Request({"type":"http","path":"/api/auth/me","headers":[(b"cookie",(auth.COOKIE+"="+token).encode())]})
    clock["at"]=start+timedelta(days=2)
    assert (await auth.current_user(request))["id"]==employee["id"]
    clock["at"]=start+timedelta(days=8)
    with pytest.raises(HTTPException) as expired:
        await auth.current_user(request)
    assert expired.value.status_code==401
    clock["at"]=start+timedelta(days=2)
    saved.clear()
    with pytest.raises(HTTPException) as revoked:
        await auth.current_user(request)
    assert revoked.value.status_code==401
