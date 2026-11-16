"""Real snapshot/majority reconciliation; missing marker never proves failure."""
import pytest
from routers import operations
from .test_p0_atomicity_integration import scenario, sale, USER
pytestmark=pytest.mark.asyncio(loop_scope='session')
async def test_confirmed_sale_query_has_no_financial_effects(scenario):
    db,_=scenario
    body=sale();result=await operations.quick_sale(body,USER)
    for _ in range(3):
        state=await operations.pdv_operation_status(body.client_ref,USER)
        assert state=={'state':'confirmed','order_id':result['order']['id'],'number':result['order']['number'],'status':'pago'}
    assert await db.orders.count_documents({})==1
    assert await db.stock_moves.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99
async def test_missing_reference_requires_review(scenario):
    db,_=scenario
    assert await operations.pdv_operation_status('web-missing-ref',USER)=={'state':'needs_review'}
    assert await db.financial_operations.count_documents({})==0
async def test_marker_without_commit_does_not_certify_sale(scenario):
    import hashlib
    db,_=scenario
    reference='web-incomplete-reference'
    await db.financial_operations.insert_one({'_id':'pdv:'+hashlib.sha256(reference.encode()).hexdigest(),'kind':'pdv_sale','order_id':'missing'})
    assert await operations.pdv_operation_status(reference,USER)=={'state':'needs_review'}

async def test_response_timeout_after_real_commit_requires_read_only_reconciliation(scenario, monkeypatch):
    import asyncio
    db,_=scenario
    committed=asyncio.Event()
    real=operations.run_transaction
    async def delayed_response(callback, *args, **kwargs):
        result=await real(callback, *args, **kwargs)
        if callback.__name__=='create':
            committed.set()
            await asyncio.sleep(10)  # Delay delivery only; all DB effects already committed.
        return result
    monkeypatch.setattr(operations,'run_transaction',delayed_response)
    body=sale()
    request=asyncio.create_task(operations.quick_sale(body,USER))
    await asyncio.wait_for(committed.wait(),5)
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(request,.01)
    result=await operations.pdv_operation_status(body.client_ref,USER)
    assert result['state']=='confirmed'
    assert await db.orders.count_documents({})==1
    assert await db.financial_operations.count_documents({})==1
    assert await db.stock_moves.count_documents({})==1
    assert (await db.ingredients.find_one({'id':'ing'}))['stock']==99
