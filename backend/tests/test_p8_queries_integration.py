"""Real MongoDB query-plan and financial semantic regressions for P8."""
import asyncio
import pytest
from fastapi import HTTPException
from models.schemas import CancelIn
from routers import operations
from .test_p0_atomicity_integration import scenario,sale,USER
pytestmark=pytest.mark.asyncio(loop_scope='session')

async def test_new_sale_reference_probe_does_not_scan_order_history(scenario):
 db,_=scenario
 await db.orders.insert_many([{'id':f'history-{i}','client_ref':f'history-ref-{i}','status':'cancelado','number':i+1} for i in range(2000)])
 await db.counters.insert_one({'_id':'order','seq':2000})
 await db.command('profile',2,filter={'ns':db.name+'.orders','op':'query'})
 try:
  result=await operations.quick_sale(sale('p8-profile-new-reference'),USER)
 finally:await db.command('profile',0)
 profile=await db.system.profile.find_one({'command.filter.client_ref':{'$exists':True}})
 assert profile is not None
 assert 'IXSCAN' in profile['planSummary'],profile
 assert profile['docsExamined']==0,profile
 assert result['order']['number']==2001
 assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99
 assert await db.financial_operations.count_documents({'kind':'pdv_sale'})==1
 replay=await operations.quick_sale(sale('p8-profile-new-reference'),USER)
 assert replay['order']['id']==result['order']['id']

@pytest.mark.parametrize('array_reference',[False,True])
async def test_legacy_reference_match_still_blocks_another_payment(scenario,array_reference):
 db,_=scenario;body=sale('p8-legacy-reference')
 await db.orders.insert_one({'id':'legacy','client_ref':[body.client_ref] if array_reference else body.client_ref,'status':'pago'})
 with pytest.raises(HTTPException) as error:await operations.quick_sale(body,USER)
 assert error.value.status_code==409
 assert await db.financial_operations.count_documents({})==0
 assert await db.stock_moves.count_documents({})==0
 assert (await db.ingredients.find_one({'id':'ing'}))['stock']==100

async def test_reference_type_predicate_is_equivalent_for_legacy_bson_values(scenario):
 db,_=scenario
 cases=[('ref-scalar','ref-scalar'),('ref-array',['ref-array',7]),('ref-null',None),('ref-number',7),('ref-bool',False),('ref-other','other')]
 for i,(ref,value) in enumerate(cases):
  await db.orders.insert_one({'id':str(i),'client_ref':value})
 await db.orders.insert_one({'id':'missing'})
 for i,(ref,_) in enumerate(cases):
  old={r['id'] async for r in db.orders.find({'client_ref':ref})}
  typed={r['id'] async for r in db.orders.find({'client_ref':{'$eq':ref,'$type':'string'}})}
  assert old==typed==({str(i)} if i<2 else set())

async def test_old_closed_cash_cannot_mutate_while_new_cash_receives_sale(scenario):
 db,_=scenario
 old=await operations.quick_sale(sale('p8-old-cash'),USER)
 await db.cash_sessions.update_one({'id':'cash'},{'$set':{'status':'fechado'}})
 await db.cash_sessions.insert_one({'id':'cash-new','status':'aberto','opening_amount':0,'movements':[]})
 cancelled,new=await asyncio.gather(operations.cancel_order(old['order']['id'],CancelIn(reason='Synthetic closed cash'),USER),operations.quick_sale(sale('p8-new-cash'),USER),return_exceptions=True)
 assert isinstance(cancelled,HTTPException) and cancelled.status_code==409
 assert isinstance(new,dict) and new['order']['cash_session_id']=='cash-new'
 assert new['order']['number']==2
 assert (await db.orders.find_one({'id':old['order']['id']}))['status']=='pago'
 assert (await db.cash_sessions.find_one({'id':'cash'}))['financial_version']==1
 assert (await db.cash_sessions.find_one({'id':'cash-new'}))['financial_version']==1
 assert (await db.ingredients.find_one({'id':'ing'}))['stock']==98
 assert await db.stock_moves.count_documents({})==2
 assert await db.financial_operations.count_documents({})==2

async def test_lookup_index_preserves_partial_unique_reference_contract(scenario):
 from pymongo.errors import DuplicateKeyError
 db,_=scenario;indexes=await db.orders.index_information()
 assert indexes['client_ref']['unique'] is True
 assert indexes['client_ref']['partialFilterExpression']=={'client_ref':{'$type':'string'}}
 assert not indexes['client_ref_lookup'].get('unique',False)
 assert 'partialFilterExpression' not in indexes['client_ref_lookup']
 await db.orders.insert_many([{'id':'null-a','client_ref':None},{'id':'null-b','client_ref':None},{'id':'missing-a'},{'id':'missing-b'}])
 await db.orders.insert_one({'id':'one','client_ref':'p8-unique-reference'})
 with pytest.raises(DuplicateKeyError):await db.orders.insert_one({'id':'two','client_ref':'p8-unique-reference'})
 assert await db.orders.count_documents({})==5
