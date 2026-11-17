"""P9 controlled P8/candidate ABBA and two 1800-second runs; synthetic only."""
import json, os, subprocess, sys, hashlib, platform
from pathlib import Path
from datetime import datetime, timezone
root=Path(__file__).resolve().parents[2]
out=root/'docs/web/p9-2026-11-16/evidence'
raw=root/'docs/web/p8-2026-11-16/evidence'
out.mkdir(parents=True,exist_ok=True)
criteria_path=root/'docs/web/p9-2026-11-16/ACCEPTANCE.json'
criteria=json.loads(criteria_path.read_text())
baseline=Path(os.environ['P8_BASELINE_ROOT'])
assert criteria_path.read_bytes()==(baseline/'docs/web/p8-2026-11-16/ACCEPTANCE.json').read_bytes()
metadata={'candidate_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
 'baseline_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=baseline,text=True).strip(),
 'criteria_sha256':hashlib.sha256(criteria_path.read_bytes()).hexdigest(),
 'platform':platform.platform(),'python':sys.version,'cpu_count':os.cpu_count(),
 'scope':'one worker, disposable MongoDB 7.0.16 replica set, keep-alive, closed-loop synthetic sale/cancel',
 'production_approved':False}
(out/'environment.json').write_text(json.dumps(metadata,indent=2)+'\n')
plan=[
 ('history',{'P8_PLAN':'before:p9h1,after:p9h2','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'30','P8_HISTORY_ORDERS':'60000'}),
 ('abba',{'P8_PLAN':'before:p9a1,after:p9b1,after:p9b2,before:p9a2','P8_LOAD_SESSIONS':'5,10,20,30,50','P8_STAGE_SECONDS':'15','P8_HISTORY_ORDERS':'0'}),
 ('baseline-long',{'P8_PLAN':'before:p9base','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'1800','P8_HISTORY_ORDERS':'0'}),
 ('candidate-long',{'P8_PLAN':'after:p9candidate','P8_LOAD_SESSIONS':'50','P8_STAGE_SECONDS':'1800','P8_HISTORY_ORDERS':'0'}),
]
results={}
failed=None
try:
 for name,settings in plan:
  (out/'progress.json').write_text(json.dumps({'running':name,'completed':list(results),'at':datetime.now(timezone.utc).isoformat()},indent=2)+'\n')
  print('P9_START',name,datetime.now(timezone.utc).isoformat(),flush=True)
  subprocess.run([sys.executable,str(root/'backend/tools/run_p8_load.py')],env={**os.environ,**settings,'P8_LOAD_SECONDS':'0','P8_PROFILE_ORDERS':'0','P9_CPU_PROFILE':'0'},check=True,cwd=root)
  for entry in settings['P8_PLAN'].split(','):
   version,label=entry.split(':')
   data=json.loads((raw/('load-'+label+'.json')).read_text())
   assert data['partial'] is False
   integrity=data['integrity']
   checks=[]
   for row in data['rows']:
    errors=row['errors']
    http503=sum(n for key,n in errors.items() if key.endswith(':503'))
    other=sum(errors.values())-http503
    observed={'http_503_maximum':http503,'other_http_or_transport_errors_maximum':other,
     'exhausted_operations_maximum':row['exhausted_operations'],
     'request_p95_ms_maximum':row['p95_ms'],'request_p99_ms_maximum':row['p99_ms'],
     'sale_cancel_pair_p95_ms_maximum':row['pair_p95_ms'],'sale_cancel_pair_p99_ms_maximum':row['pair_p99_ms']}
    verdicts={key:value is not None and value<=criteria[key] for key,value in observed.items()}
    if label in ('p9base','p9candidate'):
     verdicts['active_traffic_seconds_minimum']=row['traffic_duration_s']>=criteria['active_traffic_seconds_minimum']
    checks.append({'sessions':row['sessions'],'observed':observed,'checks':verdicts,'passed':all(verdicts.values())})
   audit=integrity['order_audit']
   financial={'financial_divergences_maximum':audit['financial_divergences'],
    'duplicate_financial_references_maximum':integrity['duplicate_refs'],
    'duplicate_order_numbers_maximum':integrity['duplicate_numbers'],
    'partial_confirmations_maximum':audit['partial_confirmations']}
   financial_checks={key:value<=criteria[key] for key,value in financial.items()}
   financial_checks['markers_and_movements']=integrity['markers']==integrity['orders']-int(settings['P8_HISTORY_ORDERS']) and integrity['stock_moves']==integrity['cash_version']==2*integrity['markers']
   financial_checks['restored_stock']=integrity['stock']==1000 and integrity['paid_orders']==0
   financial_checks['orphan_and_unexpected']=audit['orphan_markers']==audit['unexpected_stock_moves']==audit['duplicate_marker_orders']==0
   last_driver={}
   tx_count=0;retries=0
   for line in (raw/('driver-'+label+'.jsonl')).read_text().splitlines():
    event=json.loads(line)
    if event.get('kind')=='driver':last_driver=event.get('counters',{})
    if event.get('kind')=='transaction':
     tx_count+=1;retries+=max(0,event['attempts']-1)
   results[label]={'version':'P8' if version=='before' else 'P9','rows':data['rows'],'row_checks':checks,'integrity':integrity,'financial_checks':financial_checks,'driver_last_sample':last_driver,'transaction_count':tx_count,'callback_retries':retries}
   (out/'comparison.json').write_text(json.dumps(results,indent=2)+'\n')
   print('P9_RESULT',label,json.dumps(results[label]),flush=True)
except BaseException as exc:
 failed=type(exc).__name__
 raise
finally:
 complete=len(results)==8
 candidate=[v for v in results.values() if v['version']=='P9']
 passed=complete and failed is None and all(all(v['financial_checks'].values()) and all(row['passed'] for row in v['row_checks']) for v in candidate)
 verdict={'verdict':'APROVADA' if passed else 'REPROVADA' if complete and failed is None else 'INCONCLUSIVA','execution_complete':complete,'exception_type':failed,'production_approved':False,'criteria_sha256':metadata['criteria_sha256'],'candidate_head':metadata['candidate_head'],'baseline_head':metadata['baseline_head'],'results':results,'note':'Only performance scope; CI green alone is not SLA approval. Candidate must pass all recorded load rows and financial audits.'}
 (out/'acceptance-result.json').write_text(json.dumps(verdict,indent=2)+'\n')
 print('P9_VERDICT',json.dumps({k:v for k,v in verdict.items() if k!='results'}),flush=True)
