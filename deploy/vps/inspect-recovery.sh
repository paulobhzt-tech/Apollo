#!/usr/bin/env bash
# Read-only: no env contents, URI, auth, cron commands or script bodies are printed.
set -euo pipefail
set +x
python3 - <<'PY'
import hashlib,json,pathlib,subprocess
from urllib.parse import urlsplit
for name in ['apollo-pdv-apollo-1','apollo-pdv-mongo-1','apollo-homologacao-apollo-1','apollo-homologacao-mongo-1']:
 try:
  c=json.loads(subprocess.check_output(['docker','inspect',name],stderr=subprocess.DEVNULL))[0]
  env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
  u=urlsplit(env.get('MONGO_URL',''))
  print(json.dumps({'container':name,'project':c['Config'].get('Labels',{}).get('com.docker.compose.project'),'DB_NAME':env.get('DB_NAME'),'mongo_host':u.hostname,'mongo_port':u.port,'uri_database':u.path.lstrip('/'),'auth_variable_names':sorted(k for k in env if k.startswith('MONGO_INITDB_')),'mounts':[{'type':x['Type'],'name':x.get('Name'),'destination':x['Destination']} for x in c['Mounts']]},sort_keys=True))
 except Exception: print(name+': inspecao incompleta; revisar localmente sem publicar segredos')
for base in ['/opt/apollo','/opt/apollo-homologacao']:
 for name in ['backup-mongo.sh','restore-drill.sh']:
  p=pathlib.Path(base)/'deploy/vps'/name
  if p.is_file():print(str(p)+' SHA256='+hashlib.sha256(p.read_bytes()).hexdigest())
r=subprocess.run(['crontab','-l'],capture_output=True,text=True)
lines=[x for x in r.stdout.splitlines() if x.strip() and not x.lstrip().startswith('#')]
print('root_cron_entries='+str(len(lines))+' backup_matches='+str(sum('backup' in x.lower() or 'mongo' in x.lower() for x in lines)))
for directory in ['/etc/cron.d','/etc/cron.daily','/etc/cron.hourly','/etc/cron.weekly']:
 p=pathlib.Path(directory)
 if p.is_dir():
  for f in p.iterdir():
   if f.is_file():
    try:
     text=f.read_text()
     if any(x in text.lower() for x in ['apollo','mongodump','backup-mongo']):print('schedule_candidate='+str(f)+' SHA256='+hashlib.sha256(f.read_bytes()).hexdigest())
    except (OSError,UnicodeError):pass
PY
free -h
df -h / /var/backups
df -i / /var/backups
docker stats --no-stream --format '{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}'
systemctl list-timers --all --no-pager --no-legend | awk '{print $(NF-1),$NF}'
