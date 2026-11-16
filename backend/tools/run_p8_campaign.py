"""Reproducible AB/BA repetitions, followed by matched 30-minute long runs."""
import json, os, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'docs/web/p8-2026-11-16/evidence'
plan=[
 ('history-pair',{'P8_PLAN':'before:h1,after:h2','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'30','P8_LOAD_SECONDS':'0','P8_HISTORY_ORDERS':'60000','P8_PROFILE_ORDERS':'1'}),
 ('repeated-abba',{'P8_HISTORY_ORDERS':'0','P8_PROFILE_ORDERS':'0','P8_PLAN':'before:a1,after:b1,after:b2,before:a2','P8_LOAD_SESSIONS':'5,10,20,30,50','P8_STAGE_SECONDS':'15','P8_LOAD_SECONDS':'0'}),
 ('p7-long',{'P8_HISTORY_ORDERS':'0','P8_PROFILE_ORDERS':'0','P8_PLAN':'before:p7long','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'1800','P8_LOAD_SECONDS':'0'}),
 ('p8-acceptance',{'P8_HISTORY_ORDERS':'0','P8_PROFILE_ORDERS':'0','P8_PLAN':'after:acceptance','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'1800','P8_LOAD_SECONDS':'0'}),
]
resume='--resume' in sys.argv
completed=[]
def verified(label,settings):
    path=out/f'load-{label}.json'
    if not path.exists():return False
    data=json.loads(path.read_text())
    if data.get('partial',True):return False
    rows=data['rows'];v=data['integrity'];history=int(settings.get('P8_HISTORY_ORDERS','0'))
    assert len(rows)==len(settings['P8_LOAD_SESSIONS'].split(',')),label
    assert v['stock']==1000 and v['paid_orders']==v['duplicate_refs']==v['duplicate_numbers']==0,label
    assert v['markers']==v['orders']-history and v['stock_moves']==v['cash_version']==2*v['markers'],label
    assert v['counter']==v['orders'] and v['number_range'][0]['minimum']==1 and v['number_range'][0]['maximum']==v['orders'],label
    assert '1 passed' in (out/f'load-{label}.log').read_text(),label
    return True
for name,settings in plan:
    (out/'campaign-progress.json').write_text(json.dumps({'running':name,'completed':completed,'updated_at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
    print('START',name,datetime.now(timezone.utc).isoformat(),flush=True)
    pending=[]
    for entry in settings['P8_PLAN'].split(','):
        label=entry.split(':')[1]
        if resume and verified(label,settings):
            print('RESUME verified completed',label,flush=True)
            continue
        if resume and (out/f'load-{label}.json').exists():
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            for prefix,extension in [('load-','.json'),('load-','.log'),('driver-','.jsonl'),('progress-','.json'),('indexes-','.json')]:
                path=out/f'{prefix}{label}{extension}'
                if path.exists():path.rename(out/f'{prefix}{label}-interrupted-{stamp}{extension}')
        pending.append(entry)
    if pending:
        subprocess.run([sys.executable,str(root/'backend/tools/run_p8_load.py')],env={**os.environ,**settings,'P8_PLAN':','.join(pending)},check=True,cwd=root)
    completed.append(name)
(out/'campaign-progress.json').write_text(json.dumps({'running':None,'completed':completed,'updated_at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
