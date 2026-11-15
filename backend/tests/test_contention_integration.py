"""Real conflicts and unknown commits must retain the original financial unit."""
import pytest
from lib import transactions
from routers import operations
from .test_p0_atomicity_integration import scenario, sale, USER

pytestmark=pytest.mark.asyncio(loop_scope='session')

@pytest.mark.parametrize('command,code,labels,should_backoff',[
    ('insert',112,['TransientTransactionError'],True),
    ('commitTransaction',64,['UnknownTransactionCommitResult'],False),
])
async def test_real_conflicts_back_off_but_unknown_commit_only_retries_commit(scenario,monkeypatch,command,code,labels,should_backoff):
    db,client=scenario
    pauses=[];original=transactions.transient_delay
    def observe(attempt,remaining):
        delay=original(attempt,remaining)
        pauses.append((attempt,remaining,delay))
        return delay
    monkeypatch.setattr(transactions,'transient_delay',observe)
    await client.admin.command({'configureFailPoint':'failCommand','mode':{'times':3},
        'data':{'failCommands':[command],'errorCode':code,'errorLabels':labels}})
    body=sale()
    try:
        result=await operations.quick_sale(body,USER)
    finally:
        await client.admin.command({'configureFailPoint':'failCommand','mode':'off'})
    assert result['order']['status']=='pago'
    assert bool(pauses)==should_backoff
    assert all(0<=delay<=min(.5,remaining) for _,remaining,delay in pauses)
    replay=await operations.quick_sale(body,USER)
    assert replay['order']['id']==result['order']['id']
    assert await db.orders.count_documents({})==1
    assert await db.financial_operations.count_documents({})==1
    assert await db.stock_moves.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99
