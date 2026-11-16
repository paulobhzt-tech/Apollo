"""Read-plan diagnostic on owned, loopback-only disposable synthetic MongoDB."""
import json,os,subprocess,sys,tempfile,time
from pathlib import Path
from pymongo import MongoClient
from pymongo.read_concern import ReadConcern
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/web/p8-2026-11-16/evidence'

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 results=[]
 with tempfile.TemporaryDirectory(prefix='apollo-p8-plans-') as tmp,open(OUT/'query-probe.log','w') as log:
  p=subprocess.Popen([os.environ['MONGOD_BIN'],'--dbpath',tmp,'--port','27030','--bind_ip','127.0.0.1','--replSet','p8plans','--nounixsocket','--wiredTigerCacheSizeGB','0.25'],stdout=log,stderr=subprocess.STDOUT)
  try:
   c=MongoClient('mongodb://127.0.0.1:27030',directConnection=True,serverSelectionTimeoutMS=500)
   for _ in range(100):
    try:c.admin.command('ping');break
    except Exception:time.sleep(.1)
   c.admin.command('replSetInitiate',{'_id':'p8plans','members':[{'_id':0,'host':'127.0.0.1:27030'}]})
   for _ in range(100):
    if c.admin.command('hello').get('isWritablePrimary'):break
    time.sleep(.1)
   c.close();c=MongoClient('mongodb://127.0.0.1:27030/?replicaSet=p8plans',serverSelectionTimeoutMS=5000)
   c.admin.command('ping')
   os.environ.update(MONGO_URL='mongodb://127.0.0.1:27030',DB_NAME='apollo_p8_query_test')
   sys.path.insert(0,str(ROOT/'backend'))
   from lib.db import INDEXES
   from models.schemas import Order
   db=c[os.environ['DB_NAME']]
   db.orders.create_indexes(INDEXES['orders'])
   if os.environ.get('P8_LOOKUP_INDEX')=='1':db.orders.create_index([('client_ref',1)],name='client_ref_lookup')
   db.command('profile',2,slowms=0)
   count=0
   for volume in [0,1000,10000,60000]:
    seed_started=time.perf_counter()
    for first in range(count,volume,1000):
     db.orders.insert_many([{**Order(id='p8-order-'+str(i),number=i+1,client_ref='seed-'+str(i),status='cancelado',channel='balcao',source='pdv',items=[]).model_dump(),'atomic_version':1} for i in range(first,min(first+1000,volume))])
    seed_ms=(time.perf_counter()-seed_started)*1000
    count=volume
    cases={
     'sale_ref_absent':{'client_ref':'soak-new-reference'},
     'sale_ref_typed':{'client_ref':{'$eq':'soak-new-reference','$type':'string'}},
     'sale_final_id':{'id':'p8-order-'+str(max(0,volume-1))},
     'cancel_id':{'id':'p8-order-0'},
     'reconciliation':{'id':'p8-order-0','client_ref':'seed-0','atomic_version':1},
     'list_default':{},
     'list_status':{'status':'cancelado'},
    }
    stats=db.command('collStats','orders')
    for name,query in cases.items():
     command={'find':'orders','filter':query,'projection':{'_id':0},'limit':100 if name.startswith('list_') else 1,'singleBatch':True}
     if name.startswith('list_'):command['sort']={'created_at':-1}
     explain=db.command('explain',command,verbosity='executionStats')
     timings=[]
     for repeat in range(10):
      with c.start_session() as s:
       s.start_transaction(read_concern=ReadConcern('snapshot'))
       start=time.perf_counter()
       if name.startswith('list_'):list(db.orders.find(query,{'_id':0},session=s,comment='p8:'+name+':'+str(volume)).sort('created_at',-1).limit(100))
       else:db.orders.find_one(query,{'_id':0},session=s,comment='p8:'+name+':'+str(volume))
       timings.append((time.perf_counter()-start)*1000);s.commit_transaction()
     profiles=list(db.system.profile.find({'command.comment':'p8:'+name+':'+str(volume)},{'_id':0,'planSummary':1,'docsExamined':1,'keysExamined':1,'millis':1,'nreturned':1}))
     row={'volume':volume,'seed_batch_ms':seed_ms,'collectionStats':{k:stats[k] for k in ['count','size','totalIndexSize','indexSizes']},'sort':command.get('sort'),'limit':command['limit'],'name':name,'query':query,'executionStats':explain['executionStats'],'queryPlanner':explain['queryPlanner'],'transaction_query_ms':timings,'profile':profiles}
     results.append(row);print(volume,name,explain['queryPlanner']['winningPlan'],explain['executionStats']['totalDocsExamined'],flush=True)
   (OUT/os.environ.get('P8_QUERY_OUTPUT','query-plans-before.json')).write_text(json.dumps({'mongo':c.server_info()['version'],'indexes':db.orders.index_information(),'results':results},indent=2,default=str)+'\n')
   c.close()
  finally:
   p.terminate()
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:p.kill();p.wait()
if __name__=='__main__':main()
