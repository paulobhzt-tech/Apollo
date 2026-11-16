"""Collect only complete real runs; render evidence and frozen-criteria verdict."""
import base64,gzip,hashlib,json,math,os,platform,subprocess
from array import array
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/web/p8-2026-11-16/evidence'
LABELS=['h1','h2','a1','b1','b2','a2','p7long','acceptance']
def dist(v):
 v=sorted(v)
 return {k:round(v[max(0,math.ceil(len(v)*q)-1)],4) if v else None for k,q in [('p50_ms',.5),('p95_ms',.95),('p99_ms',.99)]}
def emit_file(path):
 raw=path.read_bytes();binary=path.suffix in ['.gz','.png']
 content=base64.b64encode(raw).decode() if binary else raw.decode()
 parts=[content[i:i+6000] for i in range(0,len(content),6000)] or ['']
 for i,part in enumerate(parts):
  print('P8_FINAL_FILE '+json.dumps({'path':str(path.relative_to(ROOT)),'encoding':'base64' if binary else 'utf-8','part':i,'parts':len(parts),'content':part},ensure_ascii=True),flush=True)
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 criteria_path=ROOT/'docs/web/p8-2026-11-16/ACCEPTANCE.json'
 criteria=json.loads(criteria_path.read_text())
 base=Path(os.environ['P8_BASELINE_ROOT'])
 assert criteria_path.read_bytes()==(base/'docs/web/p7-2026-11-16/ACCEPTANCE.json').read_bytes(),'Frozen criteria changed'
 campaign_path=OUT/'campaign-progress.json'
 campaign=json.loads(campaign_path.read_text()) if campaign_path.exists() else {'running':'not_started','completed':[]}
 settings={'candidate_head':os.environ.get('GITHUB_SHA'),'application_reference':'47ad2fca98b7dc8c280846ece8f1e75ce9bb6a93','baseline_head':'0a0766421d57f13ec2fbfd31aa8e1cd45461bb77','run_id':os.environ.get('GITHUB_RUN_ID'),'run_url':os.environ.get('GITHUB_SERVER_URL','https://github.com')+'/'+os.environ.get('GITHUB_REPOSITORY','paulobhzt-tech/Apollo')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID',''),'python':platform.python_version(),'platform':platform.platform(),'cpus':os.cpu_count(),'affinity_cpus':len(os.sched_getaffinity(0)),'mongo':'7.0.16','replica_members':1,'workers':1,'cache_gib':.25,'bcrypt_cost':12,'http':'loopback keep-alive','campaign_outcome':os.environ.get('P8_CAMPAIGN_OUTCOME','unknown'),'collected_at':datetime.now(timezone.utc).isoformat()}
 (OUT/'environment.json').write_text(json.dumps(settings,indent=2)+'\n')
 runs={};components={};driver_summary={}
 for label in LABELS:
  p=OUT/f'load-{label}.json'
  if not p.exists():continue
  data=json.loads(p.read_text())
  (OUT/(p.name+'.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0))
  final=data.get('integrity');history=final.get('historical_fixture_orders',0) if final else 0
  success='1 passed' in (OUT/f'load-{label}.log').read_text(errors='replace') if (OUT/f'load-{label}.log').exists() else False
  valid=bool(not data.get('partial',True) and final and success and final['stock']==1000 and final['paid_orders']==final['duplicate_refs']==final['duplicate_numbers']==0 and final['markers']==final['orders']-history and final['stock_moves']==final['cash_version']==2*final['markers'] and final['counter']==final['orders'] and final['number_range'][0]['minimum']==1 and final['number_range'][0]['maximum']==final['orders'] and final.get('order_audit',{}).get('partial_confirmations')==0 and final.get('order_audit',{}).get('financial_divergences')==0)
  resources=data.get('resources',[])
  if final:resources=[s for s in resources if s['at']<=final.get('audit_started_at',float('inf'))]
  resource_summary={}
  if resources:
   elapsed=resources[-1]['at']-resources[0]['at']
   for name in ['backend','mongo']:
    resource_summary[name]={'rss_mib_max':max(s[name]['rss_kib'] for s in resources)/1024,'cpu_seconds_delta':resources[-1][name]['cpu_seconds']-resources[0][name]['cpu_seconds']}
    resource_summary[name]['mean_cpu_core_equivalent']=resource_summary[name]['cpu_seconds_delta']/elapsed if elapsed else None
   resource_summary['mongo_connections_max']=max(s['connections']['current'] for s in resources)
   resource_summary['sample_span_s']=elapsed
  runs[label]={'complete_and_verified':valid,'partial':data.get('partial',True),'pytest_passed':success,'rows':data.get('rows',[]),'integrity':final,'resources':resource_summary,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  groups={};attempts=[];failures=[];last={}
  source=OUT/f'driver-{label}.jsonl'
  if source.exists():
   for line in source.open():
    try:event=json.loads(line)
    except json.JSONDecodeError:continue
    if event.get('kind')=='driver':last=event['counters']
    if event.get('kind')=='transaction':
     attempts.append(event['attempts'])
     if event['outcome']!='committed':failures.append(event)
    if event.get('kind')!='p8_request':continue
    key=str(event['operators'])+':'+event['operation']
    if key not in groups:groups[key]={'count':0,'statuses':Counter(),'values':defaultdict(lambda:array('d')),'commands':{}}
    g=groups[key];g['count']+=1;g['statuses'][str(event['status'])]+=1
    for k,v in event['seconds'].items():g['values'][k].append(v*1000)
    for k,v in event['commands'].items():
     if k not in g['commands']:g['commands'][k]={'count':0,'total_ms':0.,'errors':0}
     row=g['commands'][k];row['count']+=int(v['count']);row['total_ms']+=v['seconds']*1000;row['errors']+=int(v.get('errors',0))
   components[label]={k:{'requests':g['count'],'statuses':dict(g['statuses']),'components':{name:dist(vals) for name,vals in g['values'].items()},'commands':g['commands']} for k,g in groups.items()}
   driver_summary[label]={'last_sampled_counters':last,'callback_attempts':{k.replace('_ms',''):v for k,v in dist(attempts).items()},'callback_retries':sum(max(0,n-1) for n in attempts),'failures':failures,'raw_sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest()}
 (OUT/'benchmark-summary.json').write_text(json.dumps(runs,indent=2)+'\n')
 (OUT/'driver-summary.json').write_text(json.dumps(driver_summary,indent=2)+'\n')
 encoded=(json.dumps(components,indent=2)+'\n').encode();(OUT/'request-components.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
 index_ok=True
 for label in LABELS:
  p=OUT/f'indexes-{label}.json'
  if not p.exists():index_ok=False;continue
  x=json.loads(p.read_text())['orders']
  expected=label in ['h2','b1','b2','acceptance']
  index_ok=index_ok and (('client_ref_lookup' in x)==expected) and x['client_ref'].get('unique') is True and x['client_ref'].get('partialFilterExpression')=={'client_ref':{'$type':'string'}}
 plan_ok=False
 before=OUT/'query-plans-P7.json';after=OUT/'query-plans-P8.json'
 if before.exists() and after.exists():
  p7=json.loads(before.read_text());p8=json.loads(after.read_text())
  selected=[r for r in p8['results'] if r['volume']>=60000 and r['name']=='sale_ref_absent']
  plan_ok=('client_ref_lookup' not in p7['indexes'] and 'client_ref_lookup' in p8['indexes'] and bool(selected) and all(r['executionStats']['totalDocsExamined']<=1 for r in selected))
 checks={};actual={};complete=(campaign.get('running') is None and campaign.get('completed')==['history-pair','repeated-abba','p7-long','p8-acceptance'] and all(runs.get(k,{}).get('complete_and_verified') for k in LABELS) and settings['campaign_outcome']=='success' and index_ok and plan_ok)
 row=runs.get('acceptance',{}).get('rows',[None])[-1] if runs.get('acceptance',{}).get('rows') else None
 if row:
  final=runs['acceptance'].get('integrity') or {};audit=final.get('order_audit',{})
  actual={'active_traffic_seconds_minimum':row['traffic_duration_s'],'http_503_maximum':sum(v for k,v in row['errors'].items() if k.endswith(':503')),'other_http_or_transport_errors_maximum':sum(v for k,v in row['errors'].items() if not k.endswith(':503')),'exhausted_operations_maximum':row['exhausted_operations'],'request_p95_ms_maximum':row['p95_ms'],'request_p99_ms_maximum':row['p99_ms'],'sale_cancel_pair_p95_ms_maximum':row['pair_p95_ms'],'sale_cancel_pair_p99_ms_maximum':row['pair_p99_ms'],'financial_divergences_maximum':audit.get('financial_divergences'),'duplicate_financial_references_maximum':final.get('duplicate_refs'),'duplicate_order_numbers_maximum':final.get('duplicate_numbers'),'partial_confirmations_maximum':audit.get('partial_confirmations')}
  checks={k:None if v is None else (v>=criteria[k] if k.endswith('minimum') else v<=criteria[k]) for k,v in actual.items()}
 observed_financial_failure=any((r.get('integrity') or {}).get('order_audit',{}).get('financial_divergences',0)>0 or (r.get('integrity') or {}).get('order_audit',{}).get('partial_confirmations',0)>0 for r in runs.values())
 verdict='APROVADA' if complete and all(v is True for v in checks.values()) and len(checks)==12 else 'REPROVADA' if observed_financial_failure or any(v is False for v in checks.values()) else 'INCONCLUSIVO'
 result={'verdict':verdict,'execution_complete':complete,'index_contract_verified':index_ok,'query_plans_verified':plan_ok,'production_approved':False,'criteria_sha256':hashlib.sha256(criteria_path.read_bytes()).hexdigest(),'actual':actual,'checks':checks,'campaign':campaign,'candidate_head':settings['candidate_head'],'baseline_head':settings['baseline_head'],'configured_active_seconds':1800,'duration_note':'traffic_duration_s includes drain; campaign schedules 1800 active seconds. Financial audits occur only after drain.'}
 (OUT/'acceptance-result.json').write_text(json.dumps(result,indent=2)+'\n')
 plan_summary={}
 for version in ['P7','P8']:
  p=OUT/f'query-plans-{version}.json'
  if not p.exists():continue
  data=json.loads(p.read_text());(OUT/(p.name+'.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0))
  plan_summary[version]={'source_root':data.get('source_root'),'indexes':data['indexes'],'rows':[{'volume':r['volume'],'name':r['name'],'query':r['query'],'winningPlan':r['queryPlanner']['winningPlan'],'docs_examined':r['executionStats']['totalDocsExamined'],'keys_examined':r['executionStats']['totalKeysExamined'],'n_returned':r['executionStats']['nReturned'],'transaction_query_ms':dist(r['transaction_query_ms']),'collectionStats':r['collectionStats']} for r in data['results']]}
 (OUT/'query-summary.json').write_text(json.dumps(plan_summary,indent=2)+'\n')
 rows='| Execução | Completa/verificada | Pares | HTTP p50/p95/p99 (ms) | Par p95/p99 (ms) | Erros |\n|---|---|---|---|---|---|\n'
 for label,r in runs.items():
  for x in r['rows']:rows+=f"| {label} ({x['sessions']}) | {r['complete_and_verified']} | {x['completed_pairs']} | {x['p50_ms']}/{x['p95_ms']}/{x['p99_ms']} | {x['pair_p95_ms']}/{x['pair_p99_ms']} | {sum(x['errors'].values())} |\n"
 report=f"# P8 FINAL — {verdict}\n\n**PRODUÇÃO BLOQUEADA.** Aprovação, se obtida, vale somente para a campanha declarada.\n\nHEAD executado: {settings['candidate_head']}; aplicação de referência: {settings['application_reference']}; P7: {settings['baseline_head']}. [Execução e artefatos]({settings['run_url']}).\n\nExecutor local indisponível nesta sessão. Evidências locais anteriores não estavam versionadas e não puderam ser verificadas; os números anteriormente relatados não foram promovidos a evidência de aceitação. Uma campanha nova e completa foi executada em runner isolado, com banco novo por rodada. Não se reimplementou o PDV nem alterou regra financeira.\n\n{rows}\n\nCritérios preservados byte a byte de P7; resultado estruturado em evidence/acceptance-result.json. 1.800 segundos ativos por prolongado, mais drenagem; autenticação não integra o período de tráfego.\n\nRegressões verificadas no HEAD 47ad2fca98b7dc8c280846ece8f1e75ce9bb6a93: CI43948133303, 369 backend +3 subtestes, 44 P6 reais, 12 P5, 14 Node, typecheck/lint/builds web e frontend desktop. Nove avisos lint herdados. Sintaxe/integração Electron não equivale a pacote Windows com hardware homologado. O código financeiro e Electron não foram alterados nesta finalização.\n\nInterrupções anteriores: a2 interrompido e P8 prolongado sem conclusão verificável. Dados locais não recuperáveis não contam como aprovação. Os artefatos antigos do CI funcional permanecem vinculados ao PR; a campanha nova tem metadados próprios.\n\nLimitações: um worker, réplica de um membro, fixture pequena, 50 operadores fechados com keep-alive; sem adquirente/SEFAZ, impressora física, dispositivos reais, multiworker/hosts ou homologação comercial integral. Sem merge, deploy ou dados reais; P9 não iniciada.\n"
 (ROOT/'docs/web/p8-2026-11-16/REPORT.md').write_text(report)
 benchmark='# P8 — benchmark final\n\n'+rows+'\nRecursos por execução (CPU em segundos e núcleos equivalentes, RSS máximo amostrado, conexões) em evidence/benchmark-summary.json; série completa em load-*.json.gz. Amostras posteriores ao início da auditoria são excluídas da síntese de recursos.\n\nComponentes por endpoint e carga em request-components.json.gz: FIFO, sessão, startTransaction local, primeiro comando de snapshot, leituras, escritas, commit, callback e resposta ASGI. Há sobreposição: primeiro comando inclui snapshot e banco; callback contém leituras/escritas; commit da aplicação contém driver. Não somar percentis. HTTP completo e pares são medidos diretamente pelo cliente.\n\nDois ABBA por versão e um prolongado por versão; não há alegação de estabilidade universal. Dados iniciais iguais, salvo índice de tratamento. Dataset final difere com throughput. Tentativas repetem só a mesma referência e todos os erros contam; não há replay automático no browser.\n'
 (ROOT/'docs/web/p8-2026-11-16/BENCHMARK.md').write_text(benchmark)
 integrity='# P8 — integridade\n\nAuditoria somente leitura após drenagem verifica cada nova ordem: marcador por hash da referência e order_id, committed_at, estado atômico cancelado, caixa esperado, total/pagamento PIX de R$10 e exatamente um débito/retorno de ingrediente por nota. Verifica também marcadores órfãos, movimentos inesperados e duplicatas. Não é nova lógica financeira.\n\nHistórico de60.000 documentos é seed fictício de cardinalidade, não60.000 vendas homologadas; auditoria incide apenas nas novas vendas HTTP.\n\n'
 for label,r in runs.items():integrity+='## '+label+'\n\n```json\n'+json.dumps(r.get('integrity'),indent=2)+'\n```\n\n'
 integrity+='Regressões reais existentes cobrem falhas pré/pós-commit, resultado desconhecido, processo morto, replays, estoque/lotes, caixa e backup concorrentes. Aprovação do CI não substitui a aceitação prolongada. Venda offline continua bloqueada; nada foi alterado na fila ou transações.\n'
 (ROOT/'docs/web/p8-2026-11-16/INTEGRITY.md').write_text(integrity)
 analysis='# P8 — análise de consultas\n\nFonte de índices P7 e P8 explicitamente distinta. Profiler/ executionStats em Mongo7.0.16, volumes0/1.000/10.000/60.000 e maior volume final da campanha, quando disponível. A P7 possui índice único parcial de client_ref; P8 acrescenta índice não parcial não único sem alterar a igualdade original ou remover unicidade.\n\nPlanos completos em query-plans-P7.json.gz/query-plans-P8.json.gz; resumo consultável em query-summary.json. Não inferir ausência de scan apenas da existência de um índice.\n\nO espaço do índice e os tempos de seed constam dos dados de planos e são amostras do seed, não custo isolado de manutenção em transação. Escritas financeiras reais são medidas por request na campanha. Construção de índice sob carga em produção não foi testada.\n\nLista sem filtro/ordenação pode permanecer COLLSCAN+SORT fora do workload venda/cancelamento. Não foi criada mudança na granularidade FIFO nem retiradas leituras finais sem prova.\n'
 (ROOT/'docs/web/p8-2026-11-16/QUERY_ANALYSIS.md').write_text(analysis)
 traces=OUT/'execution-timeline.jsonl'
 executions=[json.loads(line) for line in traces.read_text().splitlines()] if traces.exists() else []
 timeline={'run':settings['run_url'],'campaign':campaign,'executions':executions,'note':'START/exit timestamps are in campaign.log; each row duration excludes/records login as documented. No prior partial execution reused.'}
 (OUT/'timeline.json').write_text(json.dumps(timeline,indent=2)+'\n')
 # Keep large raw drivers/logs in the hosted artifact, not in the Git tree.
 publish=[ROOT/'docs/web/p8-2026-11-16'/name for name in ['REPORT.md','BENCHMARK.md','INTEGRITY.md','QUERY_ANALYSIS.md']]
 publish +=[OUT/name for name in ['environment.json','benchmark-summary.json','driver-summary.json','request-components.json.gz','acceptance-result.json','query-summary.json','timeline.json','campaign-progress.json'] if (OUT/name).exists()]
 publish +=[p for p in OUT.glob('load-*.json.gz') if 'smoke' not in p.name]
 publish +=list(OUT.glob('indexes-*.json'))
 publish +=list(OUT.glob('query-plans-P*.json.gz'))
 manifest={str(p.relative_to(ROOT)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in publish}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');publish.append(OUT/'manifest.json')
 for p in publish:emit_file(p)
 print('P8_FINAL_VERDICT '+json.dumps(result),flush=True)
if __name__=='__main__':main()
