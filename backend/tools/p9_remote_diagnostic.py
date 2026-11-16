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
  if scope["type"]=="http" and _lag_task is None:
   _lag_task=asyncio.create_task(_lag_monitor())
  return await _base_app(scope,receive,send)
'''
profile_entry.write_text(original+instrumentation)
dest=root/'docs/web/p9-2026-11-16/evidence'
dest.mkdir(parents=True,exist_ok=True)
try:
 for label,enabled in [('control','0'),('profiled','1')]:
  env={**os.environ,'P8_PLAN':'after:'+label,'P8_LOAD_SESSIONS':'5,10,20,30,50','P8_STAGE_SECONDS':'30','P8_LOAD_SECONDS':'0','P8_HISTORY_ORDERS':'0','P8_PROFILE_ORDERS':'0','P9_CPU_PROFILE':enabled,'P9_DIAGNOSTIC_DIR':str(dest)}
  subprocess.run([sys.executable,str(root/'backend/tools/run_p8_load.py')],env=env,check=True,cwd=root)
  data=json.loads((out/('load-'+label+'.json')).read_text())
  assert data['partial'] is False
  print('P9_ROWS',label,json.dumps(data['rows']),flush=True)
  print('P9_INTEGRITY',label,json.dumps(data['integrity']),flush=True)
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
