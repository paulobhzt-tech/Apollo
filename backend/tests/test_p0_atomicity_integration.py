"""Financial safety assertions against real disposable MongoDB, never mocks."""
import asyncio
import os
import uuid
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
import pytest
import pytest_asyncio
from lib import db as database, orders
from models.schemas import CancelIn, QuickSaleIn
from routers import operations, tables

pytestmark = pytest.mark.asyncio(loop_scope='session')
USER = {'id':'synthetic-admin','name':'Synthetic admin','role':'admin'}

@pytest_asyncio.fixture(loop_scope='session')
async def scenario(monkeypatch):
    assert os.environ.get('APOLLO_P0_INTEGRATION') == '1', 'Use tools/run_replica_tests.py or isolated CI'
    url = os.environ['MONGO_URL']
    assert url.startswith('mongodb://127.0.0.1:'), 'Only disposable loopback MongoDB allowed'
    client = AsyncIOMotorClient(url, tz_aware=True)
    name = 'apollo_p0_' + uuid.uuid4().hex
    db = client[name]
    for collection, models in database.INDEXES.items():
        await db[collection].create_indexes(models)
    for module in (orders, operations, tables):
        monkeypatch.setattr(module,'db',db)
    monkeypatch.setattr(database,'client',client)
    monkeypatch.setattr(database,'db',db)
    await db.cash_sessions.insert_one({'id':'cash','status':'aberto','opening_amount':0,'movements':[]})
    await db.categories.insert_one({'id':'cat','name':'Synthetic','station':'cozinha'})
    await db.ingredients.insert_one({'id':'ing','name':'Synthetic ingredient','stock':100,'cost_per_unit':1})
    await db.products.insert_one({'id':'product','name':'Synthetic product','category_id':'cat','active':True,
        'price':10,'recipe':[{'ingredient_id':'ing','qty':1}],'options':[]})
    await db.purchases.insert_one({'id':'lot','ingredient_id':'ing','remaining_qty':100,
        'expiry_date':'2099-12-31','lot_number':'synthetic','created_at':orders.now()})
    await db.fiado_customers.insert_one({'id':'customer','name':'Synthetic','balance':0,'credit_limit':10000})
    try:
        yield db, client
    finally:
        await client.drop_database(name)
        client.close()


def sale(ref=None, **kw):
    return QuickSaleIn(client_ref=ref or 'p0-'+uuid.uuid4().hex,
        items=[{'product_id':'product','qty':1}],
        payments=kw.pop('payments',[{'method':'pix','amount':10}]),
        emit_invoice=kw.pop('emit_invoice',True),send_to_kitchen=True,**kw)


async def test_sale_stock_failure_rolls_back_payment(scenario, monkeypatch):
    db,_=scenario
    real=operations.move_stock
    async def fail(*a,**kw):
        await real(*a,**kw)
        raise HTTPException(409,'Synthetic failure after stock writes')
    monkeypatch.setattr(operations,'move_stock',fail)
    body=sale()
    with pytest.raises(HTTPException):
        await operations.quick_sale(body,USER)
    assert await db.orders.count_documents({}) == 0
    assert await db.invoices.count_documents({}) == 0
    assert await db.kitchen_tickets.count_documents({}) == 0
    assert await db.stock_moves.count_documents({}) == 0
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 100
    monkeypatch.setattr(operations,'move_stock',real)
    result=await operations.quick_sale(body,USER)
    replay=await operations.quick_sale(body,USER)
    assert replay['order']['id'] == result['order']['id']
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99
    assert await db.orders.count_documents({}) == 1
    assert await db.stock_moves.count_documents({'type':'venda'}) == 1


@pytest.mark.parametrize('concurrency',[2,10,50])
async def test_cancel_returns_stock_once(scenario,concurrency):
    db,_=scenario
    result=await operations.quick_sale(sale(),USER)
    id=result['order']['id']
    results=await asyncio.gather(*(operations.cancel_order(id,CancelIn(reason='Synthetic cancel'),USER)
                                   for _ in range(concurrency)),return_exceptions=True)
    assert any(isinstance(r,dict) for r in results),results
    assert all(isinstance(r,dict) or isinstance(r,HTTPException) for r in results),results
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 100
    assert await db.stock_moves.count_documents({'type':'estorno'}) == 1
    assert (await db.orders.find_one({'id':id}))['status'] == 'cancelado'
