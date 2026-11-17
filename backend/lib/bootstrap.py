"""Explicit secret-gated bootstrap; disabled unless an owner mounts a token file."""
import hmac
import os
from pathlib import Path

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
from pymongo.errors import DuplicateKeyError


def check_bootstrap_token(provided):
    path = os.environ.get('APOLLO_BOOTSTRAP_TOKEN_FILE')
    if not path:
        raise HTTPException(404, 'Provisionamento HTTP desabilitado')
    try:
        file = Path(path)
        if file.stat().st_mode & 0o077:
            raise ValueError()
        expected = file.read_text().strip()
        if len(expected) < 32 or len(expected) > 256:
            raise ValueError()
    except (OSError, ValueError):
        raise HTTPException(503, 'Provisionamento indisponível') from None
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(403, 'Provisionamento não autorizado')


async def provision(db, body):
    from lib.auth import secure_hash_pin
    from lib.transactions import run_transaction
    from models.schemas import Employee
    if body.password.casefold() in ('adminadminadmin', '123456789012', body.username.casefold()):
        raise HTTPException(400, 'Escolha uma senha forte e exclusiva')
    if len(set(body.pin)) == 1 or body.pin in ('123456', '654321'):
        raise HTTPException(400, 'Escolha um PIN não previsível')
    emp = Employee(name=body.name, role='admin', can_cancel=True).model_dump()
    password_hash = await run_in_threadpool(secure_hash_pin, body.password)
    pin_hash = await run_in_threadpool(secure_hash_pin, body.pin)
    async def bootstrap(session):
        # A fixed unique marker prevents two processes bootstrapping concurrently.
        if await db.employees.count_documents({}, limit=1, session=session):
            raise HTTPException(409, 'Administrador inicial já configurado')
        await db.settings.insert_one({'_id': 'initial-admin', 'employee_id': emp['id']}, session=session)
        await db.employees.insert_one({**emp, 'username': body.username.strip().lower(),
            'password_hash': password_hash, 'pin_hash': pin_hash, 'must_change_password': False}, session=session)
        return emp
    try:
        return await run_transaction(bootstrap)
    except DuplicateKeyError:
        raise HTTPException(409, 'Administrador inicial já configurado') from None
