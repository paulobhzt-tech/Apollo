"""Admission scheduling only; financial guarantees are tested against real MongoDB."""
import asyncio
import pytest
from fastapi import HTTPException
from lib import transactions

class Session:
    in_transaction=False
    async def __aenter__(self):return self
    async def __aexit__(self,*args):self.in_transaction=False
    def start_transaction(self,**kwargs):self.in_transaction=True
    async def commit_transaction(self):self.in_transaction=False
    async def abort_transaction(self):self.in_transaction=False
class Client:
    async def start_session(self):return Session()

async def test_callbacks_queue_instead_of_competing_with_same_client():
    client=Client();active=0;peak=0;order=[]
    async def call(index):
        async def callback(session):
            nonlocal active,peak
            active+=1;peak=max(peak,active);order.append(index)
            await asyncio.sleep(.005)
            active-=1;return index
        return await transactions.run_transaction(callback,client=client)
    assert await asyncio.gather(*(call(i) for i in range(10)))==list(range(10))
    assert peak==1
    assert order==list(range(10))

async def test_cancelled_waiter_never_runs_and_does_not_leak_admission():
    client=Client();started=asyncio.Event();release=asyncio.Event();calls=[]
    async def first(session):started.set();await release.wait()
    async def second(session):calls.append('cancelled')
    a=asyncio.create_task(transactions.run_transaction(first,client=client));await started.wait()
    b=asyncio.create_task(transactions.run_transaction(second,client=client));await asyncio.sleep(.01);b.cancel()
    with pytest.raises(asyncio.CancelledError):await b
    release.set();await a
    async def third(session):calls.append('third')
    await transactions.run_transaction(third,client=client)
    assert calls==['third']

async def test_queue_wait_uses_existing_budget_and_never_starts_expired_callback(monkeypatch):
    monkeypatch.setattr(transactions,'RETRY_SECONDS',.02)
    client=Client();started=asyncio.Event();release=asyncio.Event();called=False
    async def first(session):started.set();await release.wait()
    a=asyncio.create_task(transactions.run_transaction(first,client=client));await started.wait()
    async def queued(session):
        nonlocal called
        called=True
    try:
        with pytest.raises(HTTPException) as error:
            await transactions.run_transaction(queued,client=client)
        assert error.value.status_code==503
        assert not called
    finally:release.set();await a

async def test_distinct_clients_can_progress_independently():
    active=0;both=asyncio.Event()
    async def callback(session):
        nonlocal active
        active+=1
        if active==2:both.set()
        await asyncio.wait_for(both.wait(),1)
    await asyncio.gather(transactions.run_transaction(callback,client=Client()),transactions.run_transaction(callback,client=Client()))

async def test_cancelled_active_callback_releases_admission():
    client=Client();started=asyncio.Event()
    async def callback(session):started.set();await asyncio.sleep(10)
    task=asyncio.create_task(transactions.run_transaction(callback,client=client));await started.wait();task.cancel()
    with pytest.raises(asyncio.CancelledError):await task
    async def next_callback(session):return 'ok'
    assert await asyncio.wait_for(transactions.run_transaction(next_callback,client=client),1)=='ok'

async def test_read_only_snapshot_does_not_hold_writer_admission(monkeypatch):
    monkeypatch.setattr(transactions,'RETRY_SECONDS',.1)
    client=Client()
    async def write(session):return 'writer-complete'
    async def snapshot(session):return await transactions.run_transaction(write,client=client)
    assert await transactions.run_transaction(snapshot,client=client,read_only=True)=='writer-complete'
