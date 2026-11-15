"""Demonstrate unresolved financial hazards with synthetic persistence only.

These assertions detect defects, not successful financial homologation. They
must be replaced by regression tests when transactional fixes are implemented.
Run from backend with test-only MONGO_URL and DB_NAME.
"""
import asyncio
import copy
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from models.schemas import QuickSaleIn, OrderItem, Order, CancelIn
from routers import operations


async def stock_failure_replay():
    records = {}
    async def find(query, *args, **kwargs):
        return next((copy.deepcopy(o) for o in records.values()
                     if all(o.get(k) == v for k, v in query.items())), None)
    async def create(**fields):
        order = Order(id='synthetic-order', number=1, **fields).model_dump()
        records[order['id']] = copy.deepcopy(order)
        return order
    async def pay(order, body):
        # Model only the completed payment write; the route ordering is real.
        records[order['id']].update(status='pago', total=10)
        return copy.deepcopy(records[order['id']]), None
    stock = AsyncMock(side_effect=HTTPException(409, 'Synthetic stock shortage'))
    store = SimpleNamespace(orders=SimpleNamespace(find_one=AsyncMock(side_effect=find)),
                            invoices=SimpleNamespace(find_one=AsyncMock()))
    item = OrderItem(product_id='synthetic-product', name='Synthetic', qty=1, unit_price=10)
    body = QuickSaleIn(client_ref='synthetic-replay', items=[{'product_id':item.product_id,'qty':1}],
                       payments=[{'method':'pix','amount':10}], emit_invoice=False, send_to_kitchen=False)
    with patch.multiple(operations, db=store, current_cash=AsyncMock(return_value={'id':'synthetic-cash'}),
                        build_items=AsyncMock(return_value=[item]), new_order=create,
                        finalize_payment=pay, move_stock=stock):
        try:
            await operations.quick_sale(body, {'id':'synthetic','name':'Synthetic'})
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError('Expected synthetic stock failure')
        replay = await operations.quick_sale(body, {'id':'synthetic','name':'Synthetic'})
        assert replay['order']['status'] == 'pago'
        assert stock.await_count == 1, 'Replay unexpectedly retried stock'
        assert len(records) == 1
    return {'finding':'P0: paid counter sale survives stock failure; replay bypasses stock',
            'first_status':409,'replay_status':'returned paid order','stock_attempts':stock.await_count,
            'persistence':'synthetic; no MongoDB transaction exercised'}


async def concurrent_cancel():
    order = Order(id='synthetic-order', number=1, channel='balcao', source='pdv', status='pago',
                  items=[OrderItem(product_id='synthetic',name='Synthetic',qty=1,unit_price=10)]).model_dump()
    started = 0
    both = asyncio.Event()
    async def authorize(*args):
        nonlocal started
        started += 1
        if started == 2:
            both.set()
        await both.wait()
        return 'Synthetic admin'
    store = SimpleNamespace(
        orders=SimpleNamespace(find_one=AsyncMock(side_effect=lambda *a,**k:copy.deepcopy(order)),
                               update_one=AsyncMock()),
        kitchen_tickets=SimpleNamespace(update_many=AsyncMock()))
    stock = AsyncMock()
    with patch.multiple(operations, db=store, cancel_authorizer=authorize,
                        fiado_reverse=AsyncMock(), move_stock=stock):
        user={'name':'Synthetic admin','role':'admin'}
        await asyncio.gather(operations.cancel_order(order['id'],CancelIn(reason='Synthetic'),user),
                             operations.cancel_order(order['id'],CancelIn(reason='Synthetic'),user))
        assert stock.await_count == 2
    return {'finding':'P0: simultaneous cancellation restores stock twice',
            'stock_restorations':stock.await_count,'persistence':'synthetic; deterministic interleaving'}

async def main():
    print(json.dumps(await asyncio.gather(stock_failure_replay(), concurrent_cancel()),indent=2))

if __name__ == '__main__':
    asyncio.run(main())
