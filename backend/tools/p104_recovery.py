"""Local synthetic-only recovery; never enables the HTTP restore endpoint."""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.p10_environment import environment

ACK = 'SYNTHETIC_RECOVERY_ONLY'
MAX_BYTES = 64 * 1024 * 1024


def protected_json(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('Symlinks forbidden')
    with os.fdopen(os.open(path, os.O_RDONLY|os.O_NOFOLLOW), 'rb') as file:
        stat = os.fstat(file.fileno())
        import stat as mode
        if not mode.S_ISREG(stat.st_mode) or stat.st_mode & 0o077 or stat.st_size > MAX_BYTES:
            raise ValueError('Private regular file required (maximum 64 MiB)')
        return file.read()


def read_backup(path, expected):
    if not re.fullmatch('[0-9a-f]{64}', expected or ''):
        raise ValueError('Expected SHA256 required')
    raw = protected_json(path)
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('Backup SHA256 mismatch')
    payload = json.loads(raw)
    from lib.backups import decode_backup
    decode_backup(payload['data'], payload['manifest'], payload['format_version'])
    return payload


async def connect():
    if os.environ.get('APOLLO_RECOVERY_ACK') != ACK:
        raise ValueError('Explicit synthetic recovery acknowledgement required')
    cfg = environment()
    from urllib.parse import urlsplit
    if urlsplit(os.environ['MONGO_URL']).username != 'p10_homolog':
        raise ValueError('Authenticated P10 user required, including on CI')
    from lib.db import db, client
    hello = await client.admin.command('hello')
    roles = (await client.admin.command('connectionStatus')).get('authInfo', {}).get('authenticatedUserRoles', [])
    if not hello.get('isWritablePrimary') or hello.get('setName') != 'p10':
        raise ValueError('Writable P10 replica required')
    if roles != [{'role': 'readWrite', 'db': cfg['database']}]:
        raise ValueError('Restricted database role required')
    return db, client


async def identity(db):
    marker = await db.settings.find_one({'_id':'p10-isolation','synthetic':True,'environment':'homologation'})
    if not marker:
        raise ValueError('Synthetic marker missing')
    owner = await db.settings.find_one({'_id':'initial-admin'})
    employee = await db.employees.find_one({'id':owner['employee_id']}) if owner else None
    if not employee or employee.get('role') != 'admin' or not employee.get('active'):
        raise ValueError('Local active administrator required')
    return marker, employee


async def target_token(db):
    marker, owner = await identity(db)
    if not marker.get('recovery_target_id'):
        raise ValueError('Target must be prepared by prepare-target, never an ordinary live database')
    return hashlib.sha256((db.name + ':' + marker['recovery_target_id']).encode()).hexdigest(), owner


async def prepare(db, owner_data):
    # Before startup/default seed: no collections with documents are accepted.
    if any([await db[name].find_one({}) for name in await db.list_collection_names()]):
        raise ValueError('Target is not empty; no overwrite or deletion is permitted')
    from routers.auth import FirstAccessIn
    body = FirstAccessIn(**owner_data)
    from lib.db import INDEXES
    for name, indexes in INDEXES.items():
        await db[name].create_indexes(indexes)
    await db.settings.insert_one({'_id':'p10-isolation','synthetic':True,'environment':'homologation',
                                 'recovery_target_id':uuid.uuid4().hex})
    from lib.bootstrap import provision
    await provision(db, body)
    token, _ = await target_token(db)
    return {'prepared':True, 'target_id':token}


async def restore(db, payload, expected_target):
    token, owner = await target_token(db)
    if not expected_target or token != expected_target:
        raise ValueError('Recovery target identity mismatch')
    # Never accept running/used targets, even transient sessions or unlisted data.
    for name in await db.list_collection_names():
        query = {'id':{'$ne':owner['id']}} if name == 'employees' else (
            {'_id':{'$nin':['p10-isolation','initial-admin']}} if name == 'settings' else {})
        if await db[name].find_one(query):
            raise ValueError('Recovery target contains data; use a different empty target')
    from lib.backups import restore_empty
    counts = await restore_empty(db, payload['data'], payload['manifest'], payload['format_version'], owner)
    # Exact business counts; a new local identity may add one employee.
    for name, count in counts.items():
        if name not in ('employees','settings') and await db[name].count_documents({}) != count:
            raise ValueError('Post-restore count mismatch')
    await identity(db)
    return {'restored':True, 'target_id':token, 'counts':counts}


async def main(args):
    # Resolve restricted configuration before importing lazy DB helpers; no command sent yet.
    if os.environ.get('APOLLO_RECOVERY_ACK') != ACK:
        raise ValueError('Explicit synthetic recovery acknowledgement required')
    environment()
    # Validate the backup BEFORE issuing any database command.
    payload = read_backup(args.file, args.sha256) if args.mode == 'restore' else None
    db, client = await connect()
    try:
        if args.mode == 'prepare-target':
            if args.owner_file:
                owner_data = json.loads(protected_json(args.owner_file))
            else:
                import getpass
                owner_data = {'username':input('New local synthetic administrator: '),
                    'password':getpass.getpass('New password (12–72 bytes): '),
                    'pin':getpass.getpass('New PIN (6 digits): '),'name':'Administrador fictício P104'}
            result = await prepare(db, owner_data)
        elif args.mode == 'inspect-target':
            token, _ = await target_token(db)
            result = {'target_id':token}
        elif args.mode == 'backup':
            await identity(db)
            from lib.backups import export_backup
            _, payload = await export_backup(db)
            raw = (json.dumps(payload,ensure_ascii=False,sort_keys=True)+'\n').encode()
            if len(raw) > MAX_BYTES:
                raise ValueError('Backup exceeds the supported recovery size')
            # Exclusive creation; never truncate existing evidence or follow symlinks.
            fd = os.open(args.file, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd,'wb') as file:
                file.write(raw);file.flush();os.fsync(file.fileno())
            result = {'backup_sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'counts':payload['manifest']['counts']}
        else:
            result = await restore(db, payload, args.expect_target)
        print(json.dumps(result,sort_keys=True))
    finally:
        client.close()


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='mode',required=True)
    x = sub.add_parser('prepare-target');x.add_argument('--owner-file')
    sub.add_parser('inspect-target')
    x = sub.add_parser('backup');x.add_argument('file')
    x = sub.add_parser('restore');x.add_argument('file');x.add_argument('--sha256',required=True);x.add_argument('--expect-target',required=True)
    return p


if __name__ == '__main__':
    try:
        asyncio.run(main(parser().parse_args()))
    except Exception as exc:
        # Driver errors may contain addresses/credentials. Never print exception text.
        print('P104 recovery refused: '+type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)
