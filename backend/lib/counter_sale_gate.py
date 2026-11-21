"""Process-local admission control; MongoDB transactions remain authoritative.

Each worker serializes counter receipts for one operator to avoid repeatedly
aborting transactions on that operator's cash revision. Other operators proceed
independently. Weak values release idle locks; a waiting caller holds its lock.
"""
import asyncio
from contextlib import asynccontextmanager
from weakref import WeakValueDictionary

_locks = WeakValueDictionary()

@asynccontextmanager
async def counter_sale_gate(operator_id):
    # No await between lookup and insertion: creation is atomic on this event loop.
    lock = _locks.get(operator_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[operator_id] = lock
    async with lock:
        yield
