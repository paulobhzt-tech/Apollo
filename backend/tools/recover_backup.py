"""Insert-only recovery to a NEW offline database; no production auto-repairs.

Set MONGO_URL (replica set) and DB_NAME=apollo_recovery_<new_name>.
Run: python tools/recover_backup.py export.json
A fresh local administrator password is prompted, never read from the backup.
"""
import asyncio
import getpass
import json
import os
from pathlib import Path
import sys
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

async def main(path):
    from motor.motor_asyncio import AsyncIOMotorClient
    from lib.backups import restore_empty,decode_backup
    from lib.db import INDEXES
    from lib.auth import secure_hash_pin
    name=os.environ['DB_NAME']
    if not name.startswith('apollo_recovery_'):raise SystemExit('Destination must be a NEW apollo_recovery_* database')
    payload=json.loads(Path(path).read_text())
    decode_backup(payload['data'],payload.get('manifest'),payload.get('format_version'))
    client=AsyncIOMotorClient(os.environ['MONGO_URL'],tz_aware=True)
    try:
        if name in await client.list_database_names():raise SystemExit('Destination already exists; refusing recovery')
        hello=await client.admin.command('hello')
        if not hello.get('setName'):raise SystemExit('Replica set required')
        password=getpass.getpass('New local admin password (12+ characters): ')
        if len(password)<12:raise SystemExit('Password too short')
        target=client[name]
        for collection,indexes in INDEXES.items():await target[collection].create_indexes(indexes)
        admin={'id':str(uuid.uuid4()),'username':'recovery-admin','name':'Recovery administrator',
            'role':'admin','active':True,'can_cancel':True,'password_hash':secure_hash_pin(password)}
        await target.employees.insert_one(dict(admin))
        counts=await restore_empty(target,payload['data'],payload['manifest'],payload['format_version'],admin)
        print(json.dumps({'counts':counts,'message':'Recovered into new offline database; audit before switching backend'},indent=2))
    finally:client.close()

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Use: recover_backup.py export.json')
    asyncio.run(main(sys.argv[1]))
