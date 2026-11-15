"""Bounded MongoDB units of work; callbacks contain database effects only."""
import asyncio
from contextlib import suppress
import time
import random

from fastapi import HTTPException
from pymongo import ReadPreference
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern
from lib import db as database
from lib.transaction_observability import TransactionProbe

RETRY_SECONDS = 30


def transient_delay(attempt, remaining):
    """Dephase conflicts without extending the transaction retry budget."""
    cap=min(.5, .01 * 2 ** min(max(attempt-1,0),6), max(0.,remaining))
    return random.uniform(0.,cap)


class RetrySnapshot(Exception):
    """A concurrently initialized namespace requires a fresh transaction."""


async def run_transaction(callback, *, client=None):
    """Retry labelled transaction conflicts, but only COMMIT on unknown result.

    Do not use Motor 3.7.1's with_transaction here: its implicit context-manager
    commit escapes its commit-retry loop (covered by the real failpoint test).
    There are no process-local integrity locks. Unknown outcomes require the
    same operation identity on client replay. A 503 does not mean no commit.
    """
    probe = TransactionProbe()
    deadline = time.monotonic() + RETRY_SECONDS
    probe.operation=getattr(callback,"__name__","callable")
    probe.budget_deadline=deadline
    snapshot_retries = 0
    try:
        async with await (client if client is not None else database.client).start_session() as session:
            while True:
                probe.attempt()
                # Intentionally no async-with: commit must be inside our loop.
                session.start_transaction(read_concern=ReadConcern('snapshot'),
                    write_concern=WriteConcern('majority', j=True),
                    read_preference=ReadPreference.PRIMARY, max_commit_time_ms=5000)
                stage_started = time.monotonic()
                try:
                    result = await callback(session)
                except BaseException as exc:
                    probe.duration('callback', stage_started)
                    probe.error('callback', exc)
                    if session.in_transaction:
                        abort_started = time.monotonic()
                        probe.aborts += 1
                        try:
                            with suppress(PyMongoError):
                                await session.abort_transaction()
                        finally:
                            probe.duration('abort', abort_started)
                    if isinstance(exc, RetrySnapshot):
                        snapshot_retries += 1
                        if snapshot_retries <= 3 and time.monotonic() < deadline:
                            probe.retry('fresh_snapshot')
                            continue
                        raise HTTPException(409, "Operação sem marcador consistente; exige conciliação") from exc
                    if (isinstance(exc, PyMongoError) and exc.has_error_label('TransientTransactionError')
                            and time.monotonic() < deadline):
                        probe.retry('transient_callback')
                        wait_started = time.monotonic()
                        await asyncio.sleep(transient_delay(probe.attempts,deadline-time.monotonic()))
                        probe.duration('retry_wait', wait_started)
                        continue
                    raise
                else:
                    probe.duration('callback', stage_started)
                while True:
                    commit_started = time.monotonic()
                    probe.commit_calls += 1
                    try:
                        await session.commit_transaction()
                        probe.duration('commit', commit_started)
                        probe.status = 'committed'
                        return result
                    except PyMongoError as exc:
                        probe.duration('commit', commit_started)
                        probe.error('commit', exc)
                        if time.monotonic() >= deadline:
                            raise
                        if exc.has_error_label('UnknownTransactionCommitResult') and getattr(exc, "code", None) != 50:
                            probe.retry('unknown_commit')
                            wait_started = time.monotonic()
                            await asyncio.sleep(.01)
                            probe.duration('retry_wait', wait_started)
                            continue  # same session + txnNumber; never rerun effects
                        if exc.has_error_label('TransientTransactionError'):
                            probe.retry('transient_commit')
                            wait_started = time.monotonic()
                            await asyncio.sleep(transient_delay(probe.attempts,deadline-time.monotonic()))
                            probe.duration('retry_wait', wait_started)
                            break  # new transaction, fresh snapshot
                        raise
    except PyMongoError as exc:
        probe.error('outer', exc)
        raise HTTPException(503, 'Operação não confirmada. Consulte ou repita com a mesma referência; '
                            'não crie outra operação. MongoDB replica set é obrigatório.') from exc
    finally:
        probe.emit()
