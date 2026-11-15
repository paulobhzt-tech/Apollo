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

@pytest.mark.parametrize('module_name,helper',[
    ('operations','build_items'),('operations','new_order'),('operations','finalize_payment'),
    ('operations','create_ticket'),('operations','move_stock'),
    ('orders','allocate_lots_fefo'),('orders','emit_invoice'),('orders','adjust_balance'),
])
async def test_failure_at_each_sale_stage_rolls_back_every_collection(scenario,monkeypatch,module_name,helper):
    db,_=scenario
    module={'operations':operations,'orders':orders}[module_name]
    real=getattr(module,helper)
    async def fail_after_write(*a,**kw):
        await real(*a,**kw)
        raise HTTPException(409,'Synthetic interruption at '+helper)
    monkeypatch.setattr(module,helper,fail_after_write)
    with pytest.raises(HTTPException):
        await operations.quick_sale(sale(payments=[{'method':'fiado','amount':10}],fiado_customer_id='customer'),USER)
    for collection in ('orders','financial_operations','invoices','kitchen_tickets','stock_moves','lot_consumptions','customer_moves','counters'):
        assert await db[collection].count_documents({}) == 0,collection
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 0
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 100
    assert 'financial_version' not in await db.cash_sessions.find_one({'id':'cash'})


@pytest.mark.parametrize('helper',['move_stock','fiado_reverse'])
async def test_failed_cancel_rolls_back_stock_money_invoice_and_state(scenario,monkeypatch,helper):
    db,_=scenario
    result=await operations.quick_sale(sale(payments=[{'method':'fiado','amount':10}],fiado_customer_id='customer'),USER)
    real=getattr(operations,helper)
    async def fail_after_write(*a,**kw):
        await real(*a,**kw)
        raise HTTPException(409,'Synthetic cancellation failure')
    monkeypatch.setattr(operations,helper,fail_after_write)
    id=result['order']['id']
    with pytest.raises(HTTPException):
        await operations.cancel_order(id,CancelIn(reason='Synthetic cancel'),USER)
    assert (await db.orders.find_one({'id':id}))['status'] == 'pago'
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 10
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 99
    assert await db.stock_moves.count_documents({'type':'estorno'}) == 0
    assert await db.customer_moves.count_documents({'type':'estorno'}) == 0
    monkeypatch.setattr(operations,helper,real)
    await operations.cancel_order(id,CancelIn(reason='Synthetic cancel'),USER)
    await operations.cancel_order(id,CancelIn(reason='Synthetic retry'),USER)
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 0
    assert await db.customer_moves.count_documents({'type':'estorno'}) == 1
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 100


@pytest.mark.parametrize('concurrency',[2,10,50])
async def test_simultaneous_sale_replay_commits_one_set_of_effects(scenario,concurrency):
    db,_=scenario
    body=sale()
    results=await asyncio.gather(*(operations.quick_sale(body,USER) for _ in range(concurrency)))
    assert len({r['order']['id'] for r in results}) == 1
    for collection in ('orders','financial_operations','invoices','kitchen_tickets','stock_moves','lot_consumptions'):
        assert await db[collection].count_documents({}) == 1,collection
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 99


async def test_recipe_changes_do_not_change_cancellation_stock(scenario):
    db,_=scenario
    result=await operations.quick_sale(sale(),USER)
    await db.products.update_one({'id':'product'},{'$set':{'recipe':[{'ingredient_id':'ing','qty':17}]}})
    await operations.cancel_order(result['order']['id'],CancelIn(reason='Synthetic cancel'),USER)
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 100


async def test_conflicting_payload_and_legacy_incomplete_replay_are_rejected(scenario):
    db,_=scenario
    body=sale()
    await operations.quick_sale(body,USER)
    changed=body.model_copy(update={'discount':1})
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(changed,USER)
    assert error.value.status_code == 409
    legacy=sale()
    await db.orders.insert_one({'id':'legacy','client_ref':legacy.client_ref,'status':'pago'})
    with pytest.raises(HTTPException) as error:
        await operations.quick_sale(legacy,USER)
    assert error.value.status_code == 409
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99


@pytest.mark.parametrize('point',['before_commit','lost_response'])
async def test_boundary_interruption_and_retry(scenario,monkeypatch,point):
    db,_=scenario
    real=operations.run_transaction
    first=True
    async def interrupted(callback):
        nonlocal first
        if not first:
            return await real(callback)
        first=False
        if point == 'before_commit':
            async def staged(session):
                await callback(session)
                raise HTTPException(503,'Synthetic interruption before commit')
            return await real(staged)
        await real(callback)
        raise HTTPException(503,'Synthetic response lost after commit')
    monkeypatch.setattr(operations,'run_transaction',interrupted)
    body=sale()
    if point == 'before_commit':
        with pytest.raises(HTTPException):
            await operations.quick_sale(body,USER)
        assert await db.orders.count_documents({}) == 0
    else:
        await operations.quick_sale(body,USER)
    await operations.quick_sale(body,USER)
    assert await db.orders.count_documents({}) == 1
    assert await db.stock_moves.count_documents({}) == 1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99


@pytest.mark.parametrize('command,error,labels',[
    ('insert',112,['TransientTransactionError']),
    ('commitTransaction',91,['UnknownTransactionCommitResult']),
])
async def test_real_server_transaction_and_commit_retry(scenario,command,error,labels):
    db,client=scenario
    await client.admin.command({'configureFailPoint':'failCommand','mode':{'times':1},
        'data':{'failCommands':[command],'errorCode':error,'errorLabels':labels}})
    try:
        result=await operations.quick_sale(sale(),USER)
        assert result['order']['status'] == 'pago'
        assert await db.orders.count_documents({}) == 1
        assert await db.stock_moves.count_documents({}) == 1
        assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99
    finally:
        await client.admin.command({'configureFailPoint':'failCommand','mode':'off'})


async def test_independent_backend_process_replays_sale_and_cancel(scenario):
    import json
    import sys
    db,_=scenario
    body=sale()
    original=await operations.quick_sale(body,USER)
    script='''import asyncio,json,sys
from routers.operations import quick_sale,cancel_order
from models.schemas import QuickSaleIn,CancelIn
async def main():
 user={'id':'synthetic-admin','name':'Synthetic admin','role':'admin'}
 result=await quick_sale(QuickSaleIn(**json.loads(sys.argv[1])),user)
 await cancel_order(result['order']['id'],CancelIn(reason='Process replay'),user)
 print(result['order']['id'])
asyncio.run(main())
'''
    for _ in range(2):
        process=await asyncio.create_subprocess_exec(sys.executable,'-c',script,body.model_dump_json(),
            env={**os.environ,'DB_NAME':db.name},stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        stdout,stderr=await process.communicate()
        assert process.returncode == 0,stderr.decode()
        assert original['order']['id'] in stdout.decode()
    assert await db.orders.count_documents({}) == 1
    assert await db.stock_moves.count_documents({'type':'estorno'}) == 1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100

async def test_mixed_payments_and_cash_close_reconcile(scenario):
    from models.schemas import CashCloseIn
    db,_=scenario
    result=await operations.quick_sale(sale(payments=[{'method':'dinheiro','amount':6},{'method':'pix','amount':5}]),USER)
    assert result['order']['change'] == 1
    closed=await operations.cash_close(CashCloseIn(counted_amount=5),USER)
    assert closed['sales_total'] == 10
    assert closed['expected_cash'] == 5
    assert closed['totals_by_method'] == {'dinheiro':5,'pix':5}
    assert closed['difference'] == 0
    replay=await operations.quick_sale(sale(result['order']['client_ref'],payments=[{'method':'dinheiro','amount':6},{'method':'pix','amount':5}]),USER)
    assert replay['order']['id'] == result['order']['id']


@pytest.mark.parametrize('action',['payment','cancel','refund'])
async def test_cash_close_races_never_leave_stale_totals(scenario,action):
    from models.schemas import CashCloseIn
    db,_=scenario
    paid=None
    if action != 'payment':
        paid=(await operations.quick_sale(sale(payments=[{'method':'dinheiro','amount':10}]),USER))['order']
    if action == 'payment':
        mutation=operations.quick_sale(sale(payments=[{'method':'dinheiro','amount':10}]),USER)
    elif action == 'cancel':
        mutation=operations.cancel_order(paid['id'],CancelIn(reason='Race with close'),USER)
    else:
        mutation=operations.refund_item(paid['id'],paid['items'][0]['id'],CancelIn(reason='Race with close'),USER)
    result,closed=await asyncio.gather(mutation,operations.cash_close(CashCloseIn(counted_amount=0),USER),return_exceptions=True)
    assert isinstance(closed,dict),closed
    assert isinstance(result,(dict,HTTPException)),result
    paid_orders=await db.orders.find({'status':'pago','cash_session_id':'cash'}).to_list(100)
    assert closed['sales_total'] == sum(o['total'] for o in paid_orders)
    assert closed['expected_cash'] == orders.method_totals(paid_orders).get('dinheiro',0)


async def test_fiado_credit_limit_and_atomic_balance_concurrency(scenario):
    db,_=scenario
    await db.fiado_customers.update_one({'id':'customer'},{'$set':{'credit_limit':10}})
    results=await asyncio.gather(*(operations.quick_sale(sale(payments=[{'method':'fiado','amount':10}],
        fiado_customer_id='customer'),USER) for _ in range(10)),return_exceptions=True)
    assert sum(isinstance(r,dict) for r in results) == 1,results
    assert all(isinstance(r,(dict,HTTPException)) for r in results)
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 10
    assert await db.customer_moves.count_documents({'type':'compra'}) == 1
    await asyncio.gather(*(orders.adjust_balance('customer',.01) for _ in range(50)))
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 10.5


async def test_distinct_sales_cannot_oversell_single_remaining_unit(scenario):
    db,_=scenario
    await db.ingredients.update_one({'id':'ing'},{'$set':{'stock':1}})
    await db.purchases.update_one({'id':'lot'},{'$set':{'remaining_qty':1}})
    results=await asyncio.gather(*(operations.quick_sale(sale(),USER) for _ in range(10)),return_exceptions=True)
    assert sum(isinstance(r,dict) for r in results) == 1,results
    assert all(isinstance(r,(dict,HTTPException)) for r in results)
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 0
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 0
    assert await db.orders.count_documents({}) == 1


async def test_fefo_expired_lot_is_never_consumed_and_restores_original_lot(scenario):
    db,_=scenario
    await db.purchases.update_one({'id':'lot'},{'$set':{'remaining_qty':99}})
    await db.purchases.insert_one({'id':'expired','ingredient_id':'ing','remaining_qty':1,
        'expiry_date':'2000-01-01','lot_number':'expired','created_at':orders.now()})
    result=await operations.quick_sale(sale(),USER)
    assert (await db.purchases.find_one({'id':'expired'}))['remaining_qty'] == 1
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 98
    await operations.cancel_order(result['order']['id'],CancelIn(reason='Restore original lot'),USER)
    assert (await db.purchases.find_one({'id':'expired'}))['remaining_qty'] == 1
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty'] == 99


async def test_refund_item_concurrency_is_atomic_and_replayable(scenario):
    db,_=scenario
    result=await operations.quick_sale(sale(payments=[{'method':'fiado','amount':10}],fiado_customer_id='customer'),USER)
    order=result['order'];item=order['items'][0]
    results=await asyncio.gather(*(operations.refund_item(order['id'],item['id'],CancelIn(reason='Concurrent refund'),USER)
                                   for _ in range(10)))
    assert all(r['status']=='cancelado' for r in results)
    assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 0
    assert await db.customer_moves.count_documents({'type':'estorno'}) == 1
    assert await db.stock_moves.count_documents({'type':'estorno'}) == 1

async def test_killed_backend_before_commit_rolls_back_then_replay_succeeds(scenario):
    import sys
    from pathlib import Path
    import tempfile
    db,_=scenario
    body=sale()
    script='''import asyncio,os,sys
from pathlib import Path
from routers import operations
from models.schemas import QuickSaleIn
original=operations.move_stock
async def paused(*a,**kw):
 await original(*a,**kw)
 Path(sys.argv[2]).write_text('staged')
 await asyncio.sleep(60)
operations.move_stock=paused
async def main():
 await operations.quick_sale(QuickSaleIn.model_validate_json(sys.argv[1]),
  {'id':'synthetic-admin','name':'Synthetic admin','role':'admin'})
asyncio.run(main())
'''
    with tempfile.TemporaryDirectory(prefix='apollo-p0-crash-') as directory:
        marker=Path(directory)/'staged'
        process=await asyncio.create_subprocess_exec(sys.executable,'-c',script,body.model_dump_json(),str(marker),
            env={**os.environ,'DB_NAME':db.name},stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        try:
            for _ in range(100):
                if marker.exists():
                    break
                if process.returncode is not None:
                    _,stderr=await process.communicate()
                    raise AssertionError(stderr.decode())
                await asyncio.sleep(.1)
            else:
                raise AssertionError('Child did not stage the transaction')
            process.kill()
            await process.wait()
            assert await db.orders.count_documents({}) == 0
            assert await db.financial_operations.count_documents({}) == 0
            assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 100
            result=await asyncio.wait_for(operations.quick_sale(body,USER),timeout=25)
            assert result['order']['status']=='pago'
            assert await db.orders.count_documents({}) == 1
            assert (await db.ingredients.find_one({'id':'ing'}))['stock'] == 99
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

async def test_mixed_fiado_item_refund_does_not_refund_more_credit_than_paid(scenario):
    db,_=scenario
    result=await operations.quick_sale(sale(payments=[{'method':'fiado','amount':6},{'method':'pix','amount':4}],
        fiado_customer_id='customer'),USER)
    order=result['order']
    refunded=await operations.refund_item(order['id'],order['items'][0]['id'],CancelIn(reason='Mixed refund'),USER)
    assert (await db.fiado_customers.find_one({'id':'customer'}))['balance'] == 0
    assert sum(r['amount'] for r in refunded['refunds'] if r['method']=='fiado') == 6
    assert sum(r['amount'] for r in refunded['refunds'] if r['method']=='pix') == 4
