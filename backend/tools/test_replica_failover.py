"""Three real authenticated temporary mongod members: rollback/retry, election, restart."""
import asyncio
import base64
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import tempfile
import time

from pymongo import MongoClient,ReadPreference
from pymongo.errors import PyMongoError
from motor.motor_asyncio import AsyncIOMotorClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('MONGO_URL','mongodb://127.0.0.1:27101')
os.environ.setdefault('DB_NAME','apollo_p1_failover')
from lib.transactions import run_transaction


def main(output):
    binary=os.environ['MONGOD_BIN'];processes={};logs=[];result={}
    with tempfile.TemporaryDirectory(prefix='apollo-p1-three-node-') as folder:
        root=Path(folder);key=root/'cluster.key';key.write_text(base64.b64encode(secrets.token_bytes(64)).decode());key.chmod(0o400)
        password=secrets.token_urlsafe(32)
        def start(port):
            path=root/str(port);path.mkdir(exist_ok=True)
            log=open(root/(str(port)+'.log'),'a');logs.append(log)
            processes[port]=subprocess.Popen([binary,'--dbpath',str(path),'--port',str(port),
                '--bind_ip','127.0.0.1','--nounixsocket','--replSet','apolloP1','--auth','--keyFile',str(key),
                '--wiredTigerCacheSizeGB','0.25','--setParameter','diagnosticDataCollectionEnabled=false'],
                stdout=log,stderr=subprocess.STDOUT)
        try:
            for port in (27101,27102,27103):start(port)
            init=MongoClient('mongodb://127.0.0.1:27101',directConnection=True,serverSelectionTimeoutMS=500)
            for _ in range(100):
                try:init.admin.command('ping');break
                except PyMongoError:time.sleep(.1)
            else:
                raise RuntimeError('Temporary mongod did not start with keyFile')
            print('three authenticated mongod processes started',flush=True)
            init.admin.command('replSetInitiate',{'_id':'apolloP1','members':[
                {'_id':i,'host':f'127.0.0.1:{p}'} for i,p in enumerate((27101,27102,27103))]})
            for _ in range(150):
                if init.admin.command('hello').get('isWritablePrimary'):break
                time.sleep(.1)
            else:raise RuntimeError('No initial primary')
            init.admin.command('createUser','p1admin',pwd=password,roles=['root'])
            init.close()
            kwargs={'replicaSet':'apolloP1','username':'p1admin','password':password,'authSource':'admin',
                    'serverSelectionTimeoutMS':15000,'connectTimeoutMS':2000,'retryWrites':True}
            hosts=['127.0.0.1:27101','127.0.0.1:27102','127.0.0.1:27103']
            client=MongoClient(hosts,**kwargs)
            client.admin.command('ping')
            unauthorized=MongoClient(hosts,replicaSet='apolloP1',serverSelectionTimeoutMS=3000)
            try:
                unauthorized.admin.command('listDatabases')
                raise AssertionError('Unauthenticated listDatabases allowed')
            except PyMongoError as exc:result['unauthenticated_denied']=getattr(exc,'code',None)==13
            finally:unauthorized.close()
            assert result["unauthenticated_denied"]
            async def exercise():
                motor=AsyncIOMotorClient(hosts,tz_aware=True,**kwargs);db=motor.apollo_p1_failover
                await db.accounts.insert_one({'_id':'account','balance':100})
                await db.moves.create_index('operation',unique=True)
                original=(await motor.admin.command('hello'))['primary'];first=True;attempts=0
                begin=time.monotonic()
                async def transaction(session):
                    nonlocal first,attempts
                    attempts+=1
                    await db.accounts.update_one({'_id':'account'},{'$inc':{'balance':-10}},session=session)
                    await db.moves.insert_one({'_id':'movement','operation':'single-payment','amount':10},session=session)
                    if first:
                        first=False
                        try:await asyncio.to_thread(client.admin.command,{'replSetStepDown':15,'force':True})
                        except PyMongoError:pass
                    return 'committed'
                assert await run_transaction(transaction,client=motor)=='committed'
                elected=(await motor.admin.command('hello'))['primary']
                assert elected!=original,(original,elected)
                assert (await db.accounts.find_one({'_id':'account'}))['balance']==90
                assert await db.moves.count_documents({})==1
                result.update(initial_primary=original,elected_primary=elected,
                    recovery_seconds=round(time.monotonic()-begin,3),transaction_attempts=attempts,
                    balance=90,movements=1)
                motor.close()
                return int(original.rsplit(':',1)[1])
            old=asyncio.run(exercise())
            # Restart a former primary, retaining its own on-disk data.
            processes[old].kill();processes[old].wait(timeout=10);start(old)
            for _ in range(150):
                status=client.admin.command('replSetGetStatus')
                if all(m['stateStr'] in ('PRIMARY','SECONDARY') for m in status['members']):break
                time.sleep(.1)
            else:raise RuntimeError('Restarted member did not recover')
            direct=MongoClient(f'127.0.0.1:{old}',directConnection=True,username='p1admin',password=password,
                authSource='admin',read_preference=ReadPreference.SECONDARY_PREFERRED,serverSelectionTimeoutMS=5000)
            assert direct.apollo_p1_failover.accounts.find_one({'_id':'account'})['balance']==90
            direct.close();client.close()
            result.update(members=3,authentication=True,restarted_member=old,restart_preserved_data=True,restart_kind="SIGKILL former primary with retained dbpath",
                          production_touched=False,scope='single-host real replica set, generated temporary credentials')
            Path(output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
        finally:
            for process in processes.values():
                if process.poll() is None:process.terminate()
            for process in processes.values():
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait()
            for log in logs:log.close()

if __name__=='__main__':main(sys.argv[1])
