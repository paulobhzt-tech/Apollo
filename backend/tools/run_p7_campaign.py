"""Reproducible AB/BA repetitions, followed by matched 30-minute long runs."""
import json, os, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'docs/web/p7-2026-11-16/evidence'
plan=[
 ('repeated-abba',{'P7_PLAN':'before:a1,after:b1,after:b2,before:a2','P7_LOAD_SESSIONS':'5,10,20,30,50','P7_STAGE_SECONDS':'15','P7_LOAD_SECONDS':'0'}),
 ('p6-long',{'P7_PLAN':'before:p6long','P7_LOAD_SESSIONS':'50','P7_STAGE_SECONDS':'1800','P7_LOAD_SECONDS':'0'}),
 ('p7-acceptance',{'P7_PLAN':'after:acceptance','P7_LOAD_SESSIONS':'50','P7_STAGE_SECONDS':'1800','P7_LOAD_SECONDS':'0'}),
]
completed=[]
for name,settings in plan:
    (out/'campaign-progress.json').write_text(json.dumps({'running':name,'completed':completed,'updated_at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
    print('START',name,datetime.now(timezone.utc).isoformat(),flush=True)
    subprocess.run([sys.executable,str(root/'backend/tools/run_p7_load.py')],env={**os.environ,**settings},check=True,cwd=root)
    completed.append(name)
(out/'campaign-progress.json').write_text(json.dumps({'running':None,'completed':completed,'updated_at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
