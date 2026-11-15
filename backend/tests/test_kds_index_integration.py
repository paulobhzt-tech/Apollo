"""Cancellation must find related tickets without scanning unrelated orders."""
import pytest
from .test_p0_atomicity_integration import scenario

pytestmark=pytest.mark.asyncio(loop_scope='session')

async def test_cancel_ticket_lookup_is_indexed_and_allows_multiple_tickets_per_order(scenario):
    db,_=scenario
    docs=[{'id':f'synthetic-ticket-{i}','order_id':f'synthetic-order-{i}','status':'recebido'} for i in range(1000)]
    docs.append({'id':'second-ticket','order_id':'synthetic-order-999','status':'recebido'})
    await db.kitchen_tickets.insert_many(docs)
    query={'order_id':'synthetic-order-999'}
    explanation=await db.command('explain',{'update':'kitchen_tickets','updates':[
        {'q':query,'u':{'$set':{'status':'entregue'}},'multi':True}]},verbosity='executionStats')
    assert explanation['executionStats']['totalDocsExamined']==2
    result=await db.kitchen_tickets.update_many(query,{'$set':{'status':'entregue'}})
    assert result.modified_count==2
    assert await db.kitchen_tickets.count_documents({'status':'recebido'})==999
