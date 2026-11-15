"""Measure cancellation's exact update predicate, before/after a disposable index."""
import json
import os
from pathlib import Path
import pytest
from tests.test_p0_atomicity_integration import scenario

pytestmark=pytest.mark.asyncio(loop_scope='session')

async def test_kds_cancellation_query_plan(scenario):
    db,_=scenario
    await db.kitchen_tickets.insert_many([{'id':f'synthetic-ticket-{i}',
        'order_id':f'synthetic-order-{i}','status':'recebido'} for i in range(20000)])
    # This UUID fixture is disposable; remove only its experimental index
    # so the benchmark can reproduce the pre-index plan on the final code too.
    if 'order_id' in await db.kitchen_tickets.index_information():
        await db.kitchen_tickets.drop_index('order_id')
    command={'update':'kitchen_tickets','updates':[{'q':{'order_id':'synthetic-order-19999'},
        'u':{'$set':{'status':'entregue'}},'multi':True}]}
    before=await db.command('explain',command,verbosity='executionStats')
    await db.kitchen_tickets.create_index('order_id',name='order_id')
    after=await db.command('explain',command,verbosity='executionStats')
    output={label:{'documents_examined':p['executionStats']['totalDocsExamined'],
        'keys_examined':p['executionStats']['totalKeysExamined'],
        'execution_time_ms':p['executionStats']['executionTimeMillis'],
        'winning_plan':p['queryPlanner']['winningPlan']} for label,p in [('before',before),('after',after)]}
    Path(os.environ['APOLLO_KDS_PLAN_OUTPUT']).write_text(json.dumps(output,indent=2)+'\n')
    assert output['before']['documents_examined']==20000
    assert output['after']['documents_examined']==1
    result=await db.kitchen_tickets.update_many(command['updates'][0]['q'],command['updates'][0]['u'])
    assert result.modified_count==1
    assert await db.kitchen_tickets.count_documents({'status':'entregue'})==1
