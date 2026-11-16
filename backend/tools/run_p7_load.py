"""Paired loopback benchmark; baseline and candidate use identical synthetic setup."""
import os, sys, subprocess, tempfile, time, json
from pathlib import Path
import bcrypt, httpx
from pymongo import MongoClient
root=Path(__file__).resolve().parents[2]
out=root/'docs/web/p7-2026-11-16/evidence';out.mkdir(parents=True,exist_ok=True)
suffix=os.environ.get('P7_LOAD_SUFFIX','')
assert not suffix or suffix=='-diagnostic'

baseline=Path(os.environ['P7_BASELINE_ROOT'])
seconds=os.environ.get('P7_LOAD_SECONDS','300')
for item in os.environ.get('P7_PLAN','before:a1,after:b1,after:b2,before:a2').split(','):
    version,label=item.split(':');assert version in ('before','after') and label.replace('-','').isalnum()
    checkout=baseline if version=='before' else root
    children=[]
    with tempfile.TemporaryDirectory(prefix='apollo-p6-load-') as tmp, open(out/f'load-{label}{suffix}.log','w') as log:
        env={**os.environ,'MONGO_URL':'mongodb://127.0.0.1:27029/?replicaSet=p6load','DB_NAME':'apollo_p0_http_test',
             'APOLLO_P0_INTEGRATION':'1','BACKEND_URL':'http://127.0.0.1:8002','COOKIE_SECURE':'false','APP_URL':'http://127.0.0.1:8002',
             'APOLLO_LOAD_SESSIONS':os.environ.get('P7_LOAD_SESSIONS','5,10,20,30,50'),'APOLLO_STAGE_SECONDS':os.environ.get('P7_STAGE_SECONDS','15'),'APOLLO_SOAK_SECONDS':seconds,
             'APOLLO_TX_DIAGNOSTICS_FILE':str(out/f'driver-{label}.jsonl'),
             'APOLLO_PROGRESS_FILE':str(out/f'progress-{label}.json'),
             'APOLLO_SOAK_OUTPUT':str(out/f'load-{label}{suffix}.json'),'APOLLO_TX_METRICS':'1','NO_PROXY':'127.0.0.1,localhost'}
        try:
            def start(cmd,cwd=root):
                p=subprocess.Popen(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT);children.append(p);return p
            mongo=start([os.environ['MONGOD_BIN'],'--dbpath',tmp,'--port','27029','--bind_ip','127.0.0.1','--replSet','p6load','--nounixsocket','--setParameter','enableTestCommands=1','--wiredTigerCacheSizeGB','0.25'])
            client=MongoClient('mongodb://127.0.0.1:27029',directConnection=True,serverSelectionTimeoutMS=500)
            for _ in range(100):
                if mongo.poll() is not None:raise RuntimeError('Mongo failed')
                try:client.admin.command('ping');break
                except Exception:time.sleep(.1)
            client.admin.command('replSetInitiate',{'_id':'p6load','members':[{'_id':0,'host':'127.0.0.1:27029'}]})
            for _ in range(100):
                if client.admin.command('hello').get('isWritablePrimary'):break
                time.sleep(.1)
            os.environ.update({'MONGO_URL':env['MONGO_URL'],'DB_NAME':env['DB_NAME']})
            sys.path.insert(0,str(root/'backend'))
            from models.schemas import Employee,Category,Ingredient,Product,CashSession
            from lib.db import INDEXES
            db=client[env['DB_NAME']]
            for collection,models in INDEXES.items():db[collection].create_indexes(models)
            password=bcrypt.hashpw(b'Synthetic-P6-Load-Only!',bcrypt.gensalt(rounds=12)).decode()
            for i in range(50):
                db.employees.insert_one({**Employee(id=f'p6load{i}',name=f'Ficticio {i}',role='admin').model_dump(),'username':f'p6load{i}','password_hash':password})
            db.categories.insert_one(Category(id='http-cat',name='Synthetic').model_dump())
            db.ingredients.insert_one(Ingredient(id='http-ing',name='Synthetic',unit='un',stock=1000,cost_per_unit=1).model_dump())
            db.products.insert_one(Product(id='http-product',name='Synthetic',category_id='http-cat',price=10,recipe=[{'ingredient_id':'http-ing','qty':1}]).model_dump())
            db.cash_sessions.insert_one(CashSession(id='http-cash',opening_amount=0,opened_by_name='Synthetic').model_dump())
            backend=start([sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port','8002','--workers',os.environ.get('P7_SERVER_WORKERS','1')],checkout/'backend')
            env['APOLLO_BACKEND_PID']=str(backend.pid);env['APOLLO_MONGOD_PID']=str(mongo.pid)
            with httpx.Client(trust_env=False,timeout=1) as h:
                for _ in range(100):
                    try:
                        if h.get(env['BACKEND_URL']+'/api/').status_code==200:break
                    except httpx.TransportError:pass
                    time.sleep(.2)
            # Run the same benchmark file for both implementations, against the respective HTTP process.
            run_started=time.monotonic()
            result=subprocess.run([sys.executable,'-m','pytest','-n','0','-q',str(root/'backend/benchmarks/p7_web_load.py')],cwd=checkout/'backend',env=env,stdout=log,stderr=subprocess.STDOUT)
            print(label,'exit',result.returncode,'elapsed',round(time.monotonic()-run_started,2),flush=True)
            if result.returncode:raise RuntimeError(label+' benchmark failed; inspect log')
            client.close()
        finally:
            for p in reversed(children):
                p.terminate()
                try:p.wait(timeout=10)
                except subprocess.TimeoutExpired:p.kill();p.wait()
