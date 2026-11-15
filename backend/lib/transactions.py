"""Bounded MongoDB units of work; callbacks contain database effects only."""
import asyncio
from contextlib import suppress
import time

from fastapi import HTTPException
from pymongo import ReadPreference
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern
from lib import db as database

RETRY_SECONDS = 30


async def run_transaction(callback):
    """Retry labelled transaction conflicts, but only COMMIT on unknown result.

    Do not use Motor 3.7.1's with_transaction here: its implicit context-manager
    commit escapes its commit-retry loop (covered by the real failpoint test).
    There are no process-local integrity locks. Unknown outcomes require the
    same operation identity on client replay. A 503 does not mean no commit.
    """
    deadline = time.monotonic() + RETRY_SECONDS
    try:
        async with await database.client.start_session() as session:
            while True:
                # Intentionally no async-with: commit must be inside our loop.
                session.start_transaction(read_concern=ReadConcern('snapshot'),
                    write_concern=WriteConcern('majority', j=True),
                    read_preference=ReadPreference.PRIMARY, max_commit_time_ms=5000)
                try:
                    result = await callback(session)
                except BaseException as exc:
                    if session.in_transaction:
                        with suppress(PyMongoError):
                            await session.abort_transaction()
                    if (isinstance(exc, PyMongoError) and exc.has_error_label('TransientTransactionError')
                            and time.monotonic() < deadline):
                        await asyncio.sleep(.01)
                        continue
                    raise
                while True:
                    try:
                        await session.commit_transaction()
                        return result
                    except PyMongoError as exc:
                        if time.monotonic() >= deadline:
                            raise
                        if exc.has_error_label('UnknownTransactionCommitResult') and getattr(exc, "code", None) != 50:
                            await asyncio.sleep(.01)
                            continue  # same session + txnNumber; never rerun effects
                        if exc.has_error_label('TransientTransactionError'):
                            await asyncio.sleep(.01)
                            break  # new transaction, fresh snapshot
                        raise
    except PyMongoError as exc:
        raise HTTPException(503, 'Operação não confirmada. Consulte ou repita com a mesma referência; '
                            'não crie outra operação. MongoDB replica set é obrigatório.') from exc
