"""P1 regressions: real, disposable MongoDB. No production persistence mocks."""
import asyncio
import copy
import pytest
import pytest_asyncio
from fastapi import HTTPException
from lib import orders
from routers import config, fiado, tables, public, operations
from models.schemas import AddItemsIn, PublicOrderIn, ReceiveIn, DeliveryStatusIn
from .test_p0_atomicity_integration import scenario, sale, USER

pytestmark=pytest.mark.asyncio(loop_scope='session')

@pytest_asyncio.fixture(loop_scope='session')
async def p1(scenario,monkeypatch):
    db,client=scenario
    for module in (config,fiado,public):
        monkeypatch.setattr(module,'db',db)
    await db.employees.insert_one({'id':USER['id'],'name':'Synthetic','role':'admin','active':True,
        'pin_hash':'synthetic-secret','password_hash':'synthetic-password'})
    from models.schemas import Table
    await db.tables.insert_one(Table(id='table',number=1).model_dump())
    yield db,client

async def test_backup_covers_transactional_collections_and_preserves_ids(p1):
    db,_=p1
    result=await operations.quick_sale(sale(),USER)
    _,backup=await config.build_backup()
    for name in ('financial_operations','purchases','lot_consumptions','bills','payment_methods','account_categories','inventory_counts','production_batches','employee_time_entries'):
        assert name in backup['data'],name
    from bson import json_util
    decoded=json_util.loads(__import__('json').dumps(backup['data']))
    original=await db.lot_consumptions.find_one({})
    assert decoded['lot_consumptions'][0]['_id']==original['_id']
    assert decoded['financial_operations'][0]['order_id']==result['order']['id']
    assert all('password_hash' not in e and 'pin_hash' not in e for e in decoded['employees'])

async def test_fiado_write_failure_never_decrements_balance_without_history(p1,monkeypatch):
    db,_=p1
    await db.fiado_customers.update_one({'id':'customer'},{'$set':{'balance':10}})
    # Fault injection into the real server, after the balance update.
    await db.client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},
        'data':{'failCommands':['insert'],'errorCode':121}})
    try:
        with pytest.raises(Exception):
            await fiado.receive('customer',ReceiveIn(amount=10,method='pix'),USER)
    finally:
        await db.client.admin.command({'configureFailPoint':'failCommand','mode':'off'})
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance']==10
    assert await db.customer_moves.count_documents({})==0

@pytest.mark.parametrize('via',['staff','qr'])
async def test_table_stock_failure_rolls_back_order_table_and_ticket(p1,monkeypatch,via):
    db,_=p1
    module=tables if via=='staff' else public
    real=module.move_stock
    async def fail(*a,**kw):
        await real(*a,**kw)
        raise HTTPException(409,'Synthetic failure after stock writes')
    monkeypatch.setattr(module,'move_stock',fail)
    with pytest.raises(HTTPException):
        if via=='staff':
            await tables.add_items('table',AddItemsIn(items=[{'product_id':'product','qty':1}]),USER)
        else:
            await public.public_table_order('table',PublicOrderIn(items=[{'product_id':'product','qty':1}]))
    assert await db.orders.count_documents({})==0
    assert await db.kitchen_tickets.count_documents({})==0
    assert (await db.tables.find_one({'id':'table'}))['order_id'] is None
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100

async def test_delivery_accept_failure_rolls_back_ticket_and_stock(p1,monkeypatch):
    db,_=p1
    items=await orders.build_items([__import__('models.schemas',fromlist=['OrderItemIn']).OrderItemIn(product_id='product',qty=1)])
    order=await operations.create_delivery_order('site',items,{'name':'Synthetic'},'pix')
    real=operations.move_stock
    async def fail(*a,**kw):
        await real(*a,**kw)
        raise HTTPException(409,'Synthetic stock failure')
    monkeypatch.setattr(operations,'move_stock',fail)
    with pytest.raises(HTTPException):
        await operations.delivery_status(order['id'],DeliveryStatusIn(status='aceito'),USER)
    assert await db.kitchen_tickets.count_documents({})==0
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100
    assert (await db.orders.find_one({'id':order['id']}))['delivery_status']=='pendente'

async def test_backup_roundtrip_restores_markers_lots_and_replay(p1,monkeypatch):
    from lib.backups import restore_empty
    from lib.db import INDEXES
    import uuid
    db,client=p1;body=sale();result=await operations.quick_sale(body,USER)
    _,backup=await config.build_backup()
    target=client['apollo_p1_restore_'+uuid.uuid4().hex]
    try:
        for name,indexes in INDEXES.items():
            await target[name].create_indexes(indexes)
        counts=await restore_empty(target,backup['data'],backup['manifest'],backup['format_version'])
        assert counts['financial_operations']==1
        assert (await target.orders.find_one({'id':result['order']['id']}))['status']=='pago'
        before=await db.lot_consumptions.find_one({});after=await target.lot_consumptions.find_one({})
        assert before['_id']==after['_id']
        assert (await target.employees.find_one({'id':USER['id']}))['active'] is False
        monkeypatch.setattr(operations,'db',target);monkeypatch.setattr(orders,'db',target)
        replay=await operations.quick_sale(body,USER)
        assert replay['order']['id']==result['order']['id']
        assert await target.stock_moves.count_documents({})==1
    finally:
        await client.drop_database(target.name)

@pytest.mark.parametrize('bad',['missing','checksum','credentials','orphan'])
async def test_bad_backup_rejected_before_writes(p1,bad):
    from lib.backups import restore_empty,digest
    import uuid
    db,client=p1
    await operations.quick_sale(sale(),USER);_,backup=await config.build_backup()
    if bad=='missing':del backup['data']['financial_operations']
    if bad=='checksum':backup['manifest']['sha256']='bad'
    if bad=='credentials':backup['data']['employees'][0]['password_hash']='forged'
    if bad=='orphan':backup['data']['financial_operations'][0]['order_id']='absent'
    if bad in ('credentials','orphan'):
        backup['manifest']['sha256']=digest(backup['data'])
    target=client['apollo_p1_reject_'+uuid.uuid4().hex]
    try:
        with pytest.raises(HTTPException) as error:
            await restore_empty(target,backup['data'],backup['manifest'],2)
        assert error.value.status_code==422
        assert await target.orders.count_documents({})==0
    finally:await client.drop_database(target.name)

async def test_restore_does_not_overwrite_existing_database(p1):
    from lib.backups import restore_empty
    db,_=p1;await operations.quick_sale(sale(),USER);_,backup=await config.build_backup()
    original=await db.orders.find_one({})
    with pytest.raises(HTTPException) as error:
        await restore_empty(db,backup['data'],backup['manifest'],2)
    assert error.value.status_code==409
    assert await db.orders.find_one({'_id':original['_id']})==original

async def test_restore_intermediate_failure_rolls_back_all_collections(p1,monkeypatch):
    from lib.backups import restore_empty,BACKUP_COLLS
    from motor.motor_asyncio import AsyncIOMotorCollection
    import uuid
    db,client=p1;await operations.quick_sale(sale(),USER);_,backup=await config.build_backup()
    target=client['apollo_p1_rollback_'+uuid.uuid4().hex]
    original=AsyncIOMotorCollection.insert_many
    async def broken(collection,*a,**kw):
        result=await original(collection,*a,**kw)
        if collection.database.name==target.name and collection.name=='orders':
            raise HTTPException(409,'Synthetic restore interruption')
        return result
    monkeypatch.setattr(AsyncIOMotorCollection,'insert_many',broken)
    try:
        with pytest.raises(HTTPException):await restore_empty(target,backup['data'],backup['manifest'],2)
        for name in BACKUP_COLLS:assert await target[name].count_documents({})==0,name
    finally:await client.drop_database(target.name)

async def test_backup_during_sale_is_one_consistent_snapshot(p1,monkeypatch):
    from motor.motor_asyncio import AsyncIOMotorCursor
    db,_=p1;await operations.quick_sale(sale(),USER)
    original=AsyncIOMotorCursor.to_list;injected=False
    async def concurrent(cursor,*a,**kw):
        nonlocal injected
        result=await original(cursor,*a,**kw)
        if cursor.collection.database.name==db.name and cursor.collection.name=='orders' and not injected:
            injected=True
            await operations.quick_sale(sale(),USER)
        return result
    monkeypatch.setattr(AsyncIOMotorCursor,'to_list',concurrent)
    _,backup=await config.build_backup()
    assert injected
    assert len(backup['data']['orders'])==1
    assert len(backup['data']['financial_operations'])==1
    assert len(backup['data']['invoices'])==1
    assert await db.orders.count_documents({})==2

async def test_receipt_concurrency_limit_and_replay(p1):
    db,_=p1
    await db.fiado_customers.update_one({'id':'customer'},{'$set':{'balance':10}})
    body=ReceiveIn(amount=10,method='pix',client_ref='same-receipt')
    results=await asyncio.gather(*(fiado.receive('customer',body,USER) for _ in range(10)))
    assert all(r['balance']==0 for r in results)
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance']==0
    assert await db.customer_moves.count_documents({'type':'pagamento'})==1

@pytest.mark.parametrize('via',['staff','qr'])
async def test_table_replay_returns_stock_and_lots_once(p1,via):
    db,_=p1
    body={'items':[{'product_id':'product','qty':2}],'client_ref':'same-table-add'}
    for _ in range(2):
        if via=='staff':await tables.add_items('table',AddItemsIn(**body),USER)
        else:await public.public_table_order('table',PublicOrderIn(**body))
    assert await db.orders.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==98
    from models.schemas import CancelIn
    order=await db.orders.find_one({})
    await operations.cancel_order(order['id'],CancelIn(reason='Synthetic cancel'),USER)
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty']==100

async def test_pending_delivery_cancel_does_not_invent_inventory(p1):
    from models.schemas import OrderItemIn,CancelIn
    db,_=p1
    items=await orders.build_items([OrderItemIn(product_id='product',qty=1)])
    order=await operations.create_delivery_order('site',items,{'name':'Synthetic'},'pix')
    await operations.cancel_order(order['id'],CancelIn(reason='Not yet accepted'),USER)
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100
    assert await db.stock_moves.count_documents({})==0

async def test_customer_removal_preserves_balanced_financial_history(p1):
    db,_=p1
    await db.customer_moves.insert_many([
        {'id':'purchase-history','customer_id':'customer','type':'compra','amount':10},
        {'id':'receipt-history','customer_id':'customer','type':'pagamento','amount':10}])
    await fiado.delete_customer('customer',USER)
    assert await db.customer_moves.count_documents({'customer_id':'customer'})==2
    assert (await db.fiado_customers.find_one({'id':'customer'}))['active'] is False

async def test_readiness_requires_replica_set_and_critical_indexes(p1):
    from lib.health import inspect_ready
    db,client=p1
    assert await inspect_ready(db,client)
    await db.orders.drop_index('client_ref')
    assert not await inspect_ready(db,client)

async def test_distinct_receipts_cannot_overdraw_balance(p1):
    db,_=p1
    await db.fiado_customers.update_one({'id':'customer'},{'$set':{'balance':10}})
    results=await asyncio.gather(*(fiado.receive('customer',ReceiveIn(amount=10,method='pix',client_ref=f'distinct-{i}'),USER) for i in range(10)),return_exceptions=True)
    assert sum(not isinstance(r,Exception) for r in results)==1
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance']==0
    assert await db.customer_moves.count_documents({'type':'pagamento'})==1

async def test_simultaneous_table_adds_keep_one_order_and_all_stock(p1):
    db,_=p1
    await asyncio.gather(*(tables.add_items('table',AddItemsIn(items=[{'product_id':'product','qty':1}],client_ref=f'table-add-{i}'),USER) for i in range(10)))
    assert await db.orders.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==90
    assert await db.kitchen_tickets.count_documents({})==10

async def test_transfer_racing_payment_leaves_no_occupied_paid_table(p1):
    from models.schemas import Table,TransferIn,PayIn
    db,_=p1
    await db.tables.insert_one(Table(id='destination',number=2).model_dump())
    await tables.add_items('table',AddItemsIn(items=[{'product_id':'product','qty':1}]),USER)
    results=await asyncio.gather(tables.transfer('table',TransferIn(target_table_id='destination'),USER),tables.pay_table('table',PayIn(payments=[{'method':'pix','amount':10}]),USER),return_exceptions=True)
    order=await db.orders.find_one({})
    if order['status']=='aberto':
        await tables.pay_table(order['table_id'],PayIn(payments=[{'method':'pix','amount':10}]),USER)
    order=await db.orders.find_one({})
    assert order['status']=='pago'
    assert await db.tables.count_documents({'order_id':order['id']})==0
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99

async def test_delivery_accept_concurrency_moves_inventory_once(p1):
    from models.schemas import OrderItemIn
    db,_=p1
    items=await orders.build_items([OrderItemIn(product_id='product',qty=1)])
    order=await operations.create_delivery_order('site',items,{'name':'Synthetic'},'pix')
    await asyncio.gather(*(operations.delivery_status(order['id'],DeliveryStatusIn(status='aceito'),USER) for _ in range(10)))
    assert await db.kitchen_tickets.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99
