"""P7 financial regression on real disposable MongoDB; no persistence doubles."""
import asyncio, json, os, sys
import pytest
from lib import transactions
from routers import operations
from models.schemas import CancelIn
from .test_p0_atomicity_integration import scenario, sale, USER
pytestmark=pytest.mark.asyncio(loop_scope='session')

async def test_50_distinct_sales_keep_gapless_numbers_and_avoid_local_retry_storm(scenario,monkeypatch):
    db,_=scenario
    observed=[];original=transactions.TransactionProbe
    class Probe(original):
        def emit(self):observed.append((self.attempts,self.status))
    monkeypatch.setattr(transactions,'TransactionProbe',Probe)
    paid=await asyncio.gather(*(operations.quick_sale(sale('p7-distinct-'+str(i)),USER) for i in range(50)))
    assert sorted(r['order']['number'] for r in paid)==list(range(1,51))
    assert len({r['order']['id'] for r in paid})==50
    assert all(attempts==1 and status=='committed' for attempts,status in observed)
    assert await db.financial_operations.count_documents({'kind':'pdv_sale'})==50
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==50
    assert (await db.cash_sessions.find_one({'id':'cash'}))['financial_version']==50
    cash=await operations.cash_current(USER)
    assert cash['sales_count']==50 and cash['sales_total']==500
    await asyncio.gather(*(operations.cancel_order(r['order']['id'],CancelIn(reason='P7 synthetic cancel'),USER) for r in paid))
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100
    assert (await db.purchases.find_one({'id':'lot'}))['remaining_qty']==100
    assert await db.orders.count_documents({'status':'pago'})==0
    assert await db.stock_moves.count_documents({})==100
    assert (await db.cash_sessions.find_one({'id':'cash'}))['financial_version']==100

async def test_independent_processes_still_rely_on_mongo_for_integrity(scenario):
    db,_=scenario
    script='''import asyncio,json,sys
from routers import operations
from models.schemas import QuickSaleIn
async def main():
 user={'id':'synthetic-admin','name':'Synthetic admin','role':'admin'}
 async def sell(i):
  body=QuickSaleIn(client_ref=sys.argv[1]+'-'+str(i),items=[{'product_id':'product','qty':1}],payments=[{'method':'pix','amount':10}],emit_invoice=False)
  return (await operations.quick_sale(body,user))['order']['id']
 print(json.dumps(await asyncio.gather(*(sell(i) for i in range(10)))))
asyncio.run(main())
'''
    async def worker(name):
        p=await asyncio.create_subprocess_exec(sys.executable,'-c',script,name,env={**os.environ,'DB_NAME':db.name},stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        out,err=await p.communicate();assert p.returncode==0,err.decode();return json.loads(out)
    groups=await asyncio.gather(worker('p7-process-a'),worker('p7-process-b'))
    ids=[id for group in groups for id in group]
    assert len(set(ids))==20
    assert await db.financial_operations.count_documents({'kind':'pdv_sale'})==20
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==80
    numbers=[o['number'] async for o in db.orders.find({})]
    assert sorted(numbers)==list(range(1,21))
    await asyncio.gather(*(operations.cancel_order(id,CancelIn(reason='P7 multi process cancel'),USER) for id in ids))
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100
    assert (await db.cash_sessions.find_one({'id':'cash'}))['financial_version']==40
