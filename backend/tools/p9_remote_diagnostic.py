"""Diagnostic only: unchanged financial application, inherited P8 workload."""
import json, os, subprocess, sys, pstats
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'docs/web/p8-2026-11-16/evidence'
out.mkdir(parents=True,exist_ok=True)
profile_entry=root/'backend/tools/p8_profile_server.py'
original=profile_entry.read_text()
instrumentation=r'''
# P9 runner-only instrumentation; never changes transaction scheduling.
from contextlib import asynccontextmanager
from lib import transactions as _tx
_original_admit=_tx.admit
@asynccontextmanager
async def _held_admit(client,deadline,probe):
 async with _original_admit(client,deadline,probe):
  _held_start=time.perf_counter()
  try:
   yield
  finally:
   emit({"kind":"p9_gate","held_s":time.perf_counter()-_held_start})
_tx.admit=_held_admit

if os.environ.get("P9_CPU_PROFILE") == "1":
 import atexit, asyncio, cProfile, json
 from pathlib import Path
 _prof=cProfile.Profile()
 _prof.enable()
 _dest=Path(os.environ["P9_DIAGNOSTIC_DIR"])
 def _finish():
  _prof.disable()
  _prof.dump_stats(str(_dest/"cpu.prof"))
 atexit.register(_finish)
 _base_app=app
 _lag_task=None
 async def _lag_monitor():
  loop=asyncio.get_running_loop()
  while True:
   expected=loop.time()+0.05
   await asyncio.sleep(0.05)
   with (_dest/"event-loop.jsonl").open("a") as handle:
    handle.write(json.dumps({"kind":"event_loop","lag_s":max(0,loop.time()-expected),"at":time.time()})+"\n")
 async def app(scope,receive,send):
  global _lag_task
  if scope["type"]=="lifespan":
   async def _lifespan_send(message):
    if message["type"]=="lifespan.shutdown.complete":
     _finish()
    await send(message)
   return await _base_app(scope,receive,_lifespan_send)
  if scope["type"]=="http" and _lag_task is None:
   _lag_task=asyncio.create_task(_lag_monitor())
  return await _base_app(scope,receive,send)
'''
profile_entry.write_text(original+instrumentation)
dest=root/'docs/web/p9-2026-11-16/evidence'
dest.mkdir(parents=True,exist_ok=True)
benchmark=root/'backend/benchmarks/p8_web_load.py'
original_benchmark=benchmark.read_text()
benchmark.write_text(original_benchmark.replace("'transactions':status.get('transactions',{}),","'locks':status.get('locks',{}),'globalLock':status.get('globalLock',{}),'transactions':status.get('transactions',{}),"))
try:
 for entry in os.environ.get('P9_DIAGNOSTIC_PLAN','profiled:1').split(','):
  label,enabled=entry.split(':')
  env={**os.environ,'P8_PLAN':'after:'+label,'P8_LOAD_SESSIONS':os.environ.get('P9_DIAGNOSTIC_SESSIONS','50'),'P8_STAGE_SECONDS':'30','P8_LOAD_SECONDS':'0','P8_HISTORY_ORDERS':'0','P8_PROFILE_ORDERS':'0','P9_CPU_PROFILE':enabled,'P9_DIAGNOSTIC_DIR':str(dest)}
  subprocess.run([sys.executable,str(root/'backend/tools/run_p8_load.py')],env=env,check=True,cwd=root)
  data=json.loads((out/('load-'+label+'.json')).read_text())
  assert data['partial'] is False
  print('P9_ROWS',label,json.dumps(data['rows']),flush=True)
  print('P9_INTEGRITY',label,json.dumps(data['integrity']),flush=True)
  groups={}
  command_totals={}
  last_driver=None
  for line in (out/('driver-'+label+'.jsonl')).read_text().splitlines():
   event=json.loads(line)
   if event.get('kind')=='p8_request':
    op=event['operation']
    for key,value in event.get('seconds',{}).items():
     groups.setdefault(op+':'+key,[]).append(value*1000)
    for key,value in event.get('commands',{}).items():
     acc=command_totals.setdefault(op+':'+key,{'count':0,'seconds':0})
     acc['count']+=value.get('count',0)
     acc['seconds']+=value.get('seconds',0)
   elif event.get('kind')=='p9_gate':
    groups.setdefault('gate_held_ms',[]).append(event['held_s']*1000)
   elif event.get('kind')=='driver':
    last_driver=event
  def quantiles(values):
   import math
   values=sorted(values)
   return {'n':len(values),'p50':values[max(0,math.ceil(len(values)*.5)-1)],'p95':values[max(0,math.ceil(len(values)*.95)-1)],'p99':values[max(0,math.ceil(len(values)*.99)-1)]}
  summary={'components_ms':{k:quantiles(v) for k,v in groups.items()},'commands':command_totals,'last_driver':last_driver,'mongo_last_sample':data['resources'][-1]}
  (dest/('components-'+label+'.json')).write_text(json.dumps(summary,indent=2))
  print('P9_COMPONENTS',json.dumps(summary),flush=True)
 if not (dest/'cpu.prof').exists():
  raise RuntimeError('CPU profile missing: diagnostic incomplete')
 if (dest/'cpu.prof').exists():
  with (dest/'cpu.txt').open('w') as handle:
   stats=pstats.Stats(str(dest/'cpu.prof'),stream=handle)
   stats.strip_dirs().sort_stats('tottime').print_stats(60)
  print((dest/'cpu.txt').read_text(),flush=True)
 if (dest/'event-loop.jsonl').exists():
  vals=sorted(json.loads(line)['lag_s']*1000 for line in (dest/'event-loop.jsonl').read_text().splitlines())
  print('P9_EVENT_LOOP_MS',json.dumps({'samples':len(vals),'p50':vals[int((len(vals)-1)*.5)],'p95':vals[int((len(vals)-1)*.95)],'p99':vals[int((len(vals)-1)*.99)],'max':max(vals)}),flush=True)
finally:
 profile_entry.write_text(original)
 benchmark.write_text(original_benchmark)
