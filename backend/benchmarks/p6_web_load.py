"""Opt-in HTTP/MongoDB soak; explicitly selected, never in ordinary CI collection."""
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
import time
import uuid

import httpx
from pymongo import MongoClient
import pytest


def quantile(values,p):
    values=sorted(values)
    return round(values[max(0,math.ceil(len(values)*p)-1)],2) if values else None


def process_resources(pid):
    try:
        fields=Path(f'/proc/{pid}/stat').read_text().split()
        rss=next(line for line in Path(f'/proc/{pid}/status').read_text().splitlines() if line.startswith('VmRSS:'))
        return {'cpu_seconds':(int(fields[13])+int(fields[14]))/os.sysconf('SC_CLK_TCK'),
                'rss_kib':int(rss.split()[1])}
    except (OSError,StopIteration):return None


@pytest.mark.asyncio
async def test_contention_http():
    assert os.environ.get('APOLLO_P0_INTEGRATION')=='1'
    duration=int(os.environ.get('APOLLO_SOAK_SECONDS','0'))
    output=Path(os.environ['APOLLO_SOAK_OUTPUT'])
    mongo=MongoClient(os.environ['MONGO_URL']);db=mongo['apollo_p0_http_test']
    kds_index=None
    if os.environ.get('APOLLO_EXPECT_KDS_INDEX')=='1':
        for _ in range(100):
            kds_index=db.kitchen_tickets.index_information().get('order_id')
            if kds_index:break
            await asyncio.sleep(.1)
        assert kds_index and kds_index['key']==[('order_id',1)] and not kds_index.get('unique',False)
    results=[];resources=[];stop=False
    async def monitor():
        while not stop:
            status=await asyncio.to_thread(mongo.admin.command,'serverStatus')
            resources.append({'at':time.time(),'backend':process_resources(os.environ['APOLLO_BACKEND_PID']),
                'mongo':process_resources(os.environ['APOLLO_MONGOD_PID']),
                'connections':status['connections'],'mongo_memory':status['mem'],
                'write_conflicts':status.get('metrics',{}).get('operation',{}).get('writeConflicts'),
                'transactions':status.get('transactions',{}),'queues':status.get('queues',{})})
            progress=os.environ.get('APOLLO_PROGRESS_FILE')
            if progress:
                Path(progress).write_text(json.dumps({'partial':True,'resource_samples':len(resources),'latest_resource':resources[-1]},indent=2)+'\n')
            await asyncio.sleep(5)
    monitoring=asyncio.create_task(monitor())
    started=time.monotonic()
    async def stage(count,seconds):
        latencies=[];errors={};pairs=0;unique_attempted=0;exhausted=0;deadline=time.monotonic()+seconds
        async def worker(index):
            nonlocal pairs,unique_attempted,exhausted
            async with httpx.AsyncClient(base_url=os.environ['BACKEND_URL'],trust_env=False,timeout=65,
                    headers={'Origin':os.environ['BACKEND_URL']},limits=httpx.Limits(max_connections=1,max_keepalive_connections=1)) as client:
                login=await client.post('/api/auth/login',json={'username':f'p6load{index}','password':'Synthetic-P6-Load-Only!'})
                login.raise_for_status()
                client.headers['Cookie']='pdv_session='+login.cookies['pdv_session']
                async def call(path,payload):
                    for attempt in range(4):
                        before=time.perf_counter()
                        try:
                            response=await client.post(path,json=payload)
                            latencies.append((time.perf_counter()-before)*1000)
                            if response.status_code==200:return response.json()
                            key=f'{path}:{response.status_code}'
                        except httpx.TransportError as exc:
                            latencies.append((time.perf_counter()-before)*1000);key=type(exc).__name__
                        errors[key]=errors.get(key,0)+1
                        await asyncio.sleep(.05*(attempt+1))
                    return None
                while time.monotonic()<deadline:
                    unique_attempted+=1
                    ref='soak-'+uuid.uuid4().hex
                    payload={'client_ref':ref,'items':[{'product_id':'http-product','qty':1}],
                        'payments':[{'method':'pix','amount':10}],'emit_invoice':False,'send_to_kitchen':True}
                    paid=await call('/api/pdv/sale',payload)
                    if paid:
                        cancelled=await call('/api/orders/'+paid['order']['id']+'/cancel',{'reason':'Synthetic soak cancellation'})
                        if cancelled:pairs+=1
                        else:exhausted+=1
                    else:exhausted+=1
        begin=time.monotonic()
        await asyncio.gather(*(worker(index) for index in range(count)))
        elapsed=time.monotonic()-begin
        row={'sessions':count,'duration_s':round(elapsed,3),'completed_pairs':pairs,'requests':len(latencies),
            'p50_ms':quantile(latencies,.5),'p95_ms':quantile(latencies,.95),'p99_ms':quantile(latencies,.99),
            'request_throughput_s':round(len(latencies)/elapsed,2),'error_rate':sum(errors.values())/max(1,len(latencies)),
            'errors':errors,'unique_attempted':unique_attempted,'exhausted_operations':exhausted,
            'unique_completed_operations_s':round(pairs*2/elapsed,2)}
        results.append(row)
        output.write_text(json.dumps({'partial':True,'rows':results,'resources':resources},indent=2)+'\n')
    try:
        for count in map(int,os.environ.get('APOLLO_LOAD_SESSIONS','1,5,10,20,30,50').split(',')):
            await stage(count,float(os.environ.get('APOLLO_STAGE_SECONDS','20')))
        remaining=max(0,duration-(time.monotonic()-started))
        if remaining:await stage(50,remaining)
        duplicates=list(db.orders.aggregate([{'$group':{'_id':'$client_ref','n':{'$sum':1}}},{'$match':{'n':{'$gt':1}}}]))
        final={'stock':db.ingredients.find_one({'id':'http-ing'})['stock'],
               'paid_orders':db.orders.count_documents({'status':'pago'}),'duplicate_refs':len(duplicates),
               'orders':db.orders.count_documents({}),
               'markers':db.financial_operations.count_documents({'kind':'pdv_sale'}),
               'stock_moves':db.stock_moves.count_documents({}),
               'cash_version':db.cash_sessions.find_one({'id':'http-cash'}).get('financial_version',0)}
        output.write_text(json.dumps({'partial':False,'duration_s':time.monotonic()-started,'rows':results,
            'resources':resources,'integrity':final,'kds_index':kds_index,'scope':'real HTTP keep-alive + single-node MongoDB; synthetic PDV sale/cancel; transaction policy under test'},indent=2)+'\n')
        assert final['markers']==final['orders'] and final['stock_moves']==2*final['orders'] and final['cash_version']==2*final['orders'],final
        assert final['stock']==1000 and final['paid_orders']==0 and not duplicates,final
    finally:
        stop=True
        monitoring.cancel()
        try:await monitoring
        except asyncio.CancelledError:pass
        mongo.close()
