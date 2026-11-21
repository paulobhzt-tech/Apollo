"""Authorization is checked before the supported client sends a reprint."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi import FastAPI
from lib.auth import current_user
from routers import production

@pytest.mark.asyncio
@pytest.mark.parametrize("role,status", [("admin",200),("caixa",403),("garcom",403),("cozinha",403)])
async def test_reprint_requires_admin_and_records_actor(monkeypatch, role, status):
    audit=AsyncMock()
    tickets=SimpleNamespace(find_one=AsyncMock(return_value={"id":"fictional-ticket","items":[{"station":"bar"}]}))
    monkeypatch.setattr(production,"db",SimpleNamespace(kitchen_tickets=tickets,print_audit=SimpleNamespace(insert_one=audit)))
    app=FastAPI()
    app.include_router(production.router)
    async def user():
        return {"id":"fictitious-operator","name":"Teste","role":role}
    app.dependency_overrides[current_user]=user
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url="http://test") as client:
        result=await client.post("/kds/tickets/fictional-ticket/reprint-authorization",json={"station":"bar"})
    assert result.status_code==status
    if status==200:
        event=audit.await_args.args[0]
        assert event["actor_id"]=="fictitious-operator"
        assert event["station"]=="bar"
        assert event["action"]=="reprint_authorized"
    else:
        tickets.find_one.assert_not_awaited()
        audit.assert_not_awaited()

@pytest.mark.asyncio
async def test_invalid_reprint_station_does_not_create_audit(monkeypatch):
    from fastapi import HTTPException
    from models.schemas import TicketPrintedIn
    audit=AsyncMock()
    monkeypatch.setattr(production,"db",SimpleNamespace(
        kitchen_tickets=SimpleNamespace(find_one=AsyncMock(return_value={"items":[{"station":"bar","print_ticket":False}]})),
        print_audit=SimpleNamespace(insert_one=audit)))
    with pytest.raises(HTTPException) as exc:
        await production.authorize_reprint("fictional-ticket",TicketPrintedIn(station="bar"),{"id":"admin","role":"admin"})
    assert exc.value.status_code==422
    audit.assert_not_awaited()
