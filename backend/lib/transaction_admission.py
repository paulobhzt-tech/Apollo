"""Process-local admission optimization, never an integrity lock.

Order counters and the open cash register already serialize writes in MongoDB.
Queue this process's callbacks before acquiring a snapshot instead of repeatedly
aborting competing transactions. Other processes remain protected by the exact
same MongoDB transactions, marker checks and conditional writes.
"""
import asyncio
import time
from contextlib import asynccontextmanager
from weakref import WeakValueDictionary
from fastapi import HTTPException

class _Gate:
    def __init__(self):
        self.lock = asyncio.Lock()  # asyncio.Lock admits existing waiters FIFO.

# Values disappear when the final active/waiting call exits. No idle loop/client
# retention, and no asyncio primitive can accidentally cross event loops.
_gates = WeakValueDictionary()

def _gate_for(client):
    key = (asyncio.get_running_loop(), id(client))
    gate = _gates.get(key)
    if gate is None:
        gate = _Gate()
        _gates[key] = gate
    return gate

@asynccontextmanager
async def admit(client, deadline, probe):
    gate = _gate_for(client)
    acquired = False
    started = time.monotonic()
    try:
        try:
            # The deadline is the original transaction budget, set at arrival.
            async with asyncio.timeout_at(deadline):
                await gate.lock.acquire()
                acquired = True
        except TimeoutError as exc:
            probe.error('admission', exc)
            raise HTTPException(503, 'Operação não confirmada: capacidade transacional ocupada. '
                                'Consulte a mesma referência; não crie outro pagamento.') from exc
        finally:
            probe.duration('admission_wait', started)
        yield
    finally:
        if acquired:
            gate.lock.release()
