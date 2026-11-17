import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException, Response
from starlette.requests import Request
from httpx import AsyncClient, ASGITransport
from lib import auth
from routers import auth as routes
from models.schemas import LoginIn
from tests.test_p0_atomicity_integration import scenario

pytestmark = pytest.mark.asyncio(loop_scope='session')


def request(token=None):
    return Request({'type':'http','method':'POST','path':'/api/auth/first-access',
        'client':('127.0.0.1',50000),'headers':[(b'x-apollo-bootstrap',token.encode())] if token else []})


async def test_two_bootstraps_create_exactly_one_strong_admin(scenario, monkeypatch, tmp_path):
    db,_ = scenario
    monkeypatch.setattr(auth,'db',db);monkeypatch.setattr(routes,'db',db)
    token = tmp_path/'token';token.write_text('s'*48);token.chmod(0o600)
    monkeypatch.setenv('APOLLO_BOOTSTRAP_TOKEN_FILE',str(token))
    body = routes.FirstAccessIn(username='ficticio-admin',password='Synthetic-P10-Only!',pin='739251')
    results = await asyncio.gather(*(routes.first_access(body,Response(),request('s'*48)) for _ in range(2)),return_exceptions=True)
    assert sum(isinstance(x,dict) for x in results)==1
    assert sum(isinstance(x,HTTPException) and x.status_code==409 for x in results)==1
    assert await db.employees.count_documents({})==1
    employee = await db.employees.find_one({})
    assert employee['password_hash']!=body.password and employee['pin_hash']!=body.pin
    response=Response()
    await routes.login(LoginIn(username=body.username,password=body.password),response,request())
    cookie=response.headers['set-cookie'].lower()
    assert 'secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie
    assert await db.settings.count_documents({'_id':'initial-admin'})==1


async def test_concurrent_login_reservations_cannot_bypass_budget(scenario,monkeypatch):
    db,_=scenario;monkeypatch.setattr(auth,'db',db)
    requests=[request() for _ in range(20)]
    results=await asyncio.gather(*(auth.check_login_limit(r) for r in requests),return_exceptions=True)
    assert sum(not isinstance(x,Exception) for x in results)==auth.LOGIN_LIMIT
    assert sum(isinstance(x,HTTPException) and x.status_code==429 for x in results)==15
    await auth.successful_login(requests[0])
    record=await db.login_attempts.find_one({'_id':auth.login_key(requests[0])})
    assert record['attempts']==19  # A successful attempt cannot erase other failures.


async def test_validation_does_not_echo_password_or_pin():
    from server import app
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        response=await client.post('/api/auth/login',json={'username':'ficticio','password':'PRIVATE-PASSWORD-'*20,'pin':'PRIVATE-PIN'})
    assert response.status_code==422
    assert 'PRIVATE' not in response.text and 'input' not in response.text


async def test_homologation_hides_employee_directory(monkeypatch):
    monkeypatch.setenv('APOLLO_ENV','homologation')
    assert await routes.profiles()==[]


async def test_logical_backup_preserves_local_isolation_and_security_markers(scenario):
    from lib.backups import export_backup, restore_empty
    from tests.test_p0_atomicity_integration import sale, USER
    from routers import operations
    import uuid
    db,client=scenario
    await db.settings.insert_many([{'_id':'p10-isolation','synthetic':True,'environment':'homologation'},
                                  {'_id':'initial-admin','employee_id':'source-owner'}])
    await operations.quick_sale(sale(emit_invoice=False),USER)
    _,payload=await export_backup(db)
    assert not any(x['_id'] in ('p10-isolation','initial-admin') for x in payload['data']['settings'])
    target=client['apollo_p10_test_restore_'+uuid.uuid4().hex]
    try:
        marker={'_id':'p10-isolation','synthetic':True,'environment':'homologation','local_only':True}
        await target.settings.insert_many([marker,{'_id':'initial-admin','employee_id':'local-owner'}])
        await target.employees.insert_one({'id':'local-owner','role':'admin','active':True,'password_hash':'local-secret'})
        await restore_empty(target,payload['data'],payload['manifest'],payload['format_version'],{'id':'local-owner'})
        assert await target.settings.find_one({'_id':'p10-isolation'})==marker
        assert (await target.employees.find_one({'id':'local-owner'}))['password_hash']=='local-secret'
        assert await target.orders.count_documents({})==1
        assert (await target.ingredients.find_one({'id':'ing'}))['stock']==99
    finally:
        await client.drop_database(target.name)
