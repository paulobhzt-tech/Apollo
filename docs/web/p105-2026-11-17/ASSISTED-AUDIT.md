# P10.5 — inspeção assistida somente leitura

Não executada na VPS pelo Work. O comando abaixo usa o SSH do Windows e envia Python por stdin, evitando a perda de aspas de `mongosh --eval` entre PowerShell e Bash. Não altera arquivos, serviços ou dados do Mongo. Consultas usam apenas o container de recuperação já existente e metadados dos quatro containers ativos; não criam Mongo adicional.

Antes de conectar, conferir fingerprint no console/painel independente. A chave correta deve estar no known_hosts do computador do proprietário; não usar StrictHostKeyChecking=no. Informar a senha apenas no prompt SSH local, nunca no chat. Usar usuário com leitura Docker autorizado; a referência root decorre da sessão previamente informada pelo proprietário, não é exigência de execução como root.

Copiar o bloco inteiro para PowerShell. Informar o destino SSH fornecido nesta missão quando solicitado (login@IP). Se faltar autenticação/host key ou qualquer verificação falhar, parar e registrar a pendência.

```powershell
$ApolloSshTarget = Read-Host 'Destino SSH (login@IP)'
$ApolloAudit = @'
import json, subprocess, pathlib, time, re
started = time.monotonic()
def call(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=45)
def emit(kind, **data):
    print(json.dumps(dict(kind=kind, **data), sort_keys=True))
names = ['apollo-pdv-apollo-1','apollo-pdv-mongo-1','apollo-homologacao-apollo-1','apollo-homologacao-mongo-1','apollo-backup-teste-301']
r = call(['docker','info','--format','{{json .ServerVersion}}'])
emit('docker', available=r.returncode == 0)
recovery_ok = False
for name in names:
    r = call(['docker','inspect',name])
    if r.returncode:
        emit('container', name=name, inspect_ok=False)
        continue
    c = json.loads(r.stdout)[0]; h = c['HostConfig']; s = c['State']
    ports = c.get('NetworkSettings',{}).get('Ports') or {}
    networks = sorted(c.get('NetworkSettings',{}).get('Networks',{}))
    no_published_ports = not any(ports.values()) and not h.get('PortBindings') and not h.get('PublishAllPorts')
    emit('container', name=name, running=s.get('Running'), health=s.get('Health',{}).get('Status'), oom_killed=s.get('OOMKilled'), restarts=c.get('RestartCount'), exit_code=s.get('ExitCode'), memory_limit=h.get('Memory'), nano_cpus=h.get('NanoCpus'), cpu_quota=h.get('CpuQuota'), cpu_period=h.get('CpuPeriod'), restart_policy=h.get('RestartPolicy',{}).get('Name'), mount_count=len(c.get('Mounts',[])), networks=networks, no_published_ports=no_published_ports)
    if name == names[-1]:
        cpu_limited = h.get('NanoCpus',0) == 1000000000 or (h.get('CpuPeriod',0) > 0 and h.get('CpuQuota',0) == h.get('CpuPeriod'))
        recovery_ok = bool(s.get('Running') and h.get('NetworkMode') == 'none' and networks == ['none'] and no_published_ports and not c.get('Mounts') and h.get('Memory') == 536870912 and cpu_limited and h.get('RestartPolicy',{}).get('Name') in ('no',''))
        emit('recovery_isolation', matches_reported=recovery_ok)
    logs = call(['docker','logs','--tail','300','--since','24h',name])
    text = (logs.stdout + logs.stderr).lower()
    emit('log_summary', name=name, read_ok=logs.returncode == 0, error_lines=sum(bool(re.search(r'\b(error|fatal|panic|oom)\b|out of memory|no space left|input/output error',line)) for line in text.splitlines()))
if recovery_ok:
    js = "const expected={p105_restore_producao_20261117:{collections:20,documents:18},p105_restore_homologacao_20261117:{collections:29,documents:36}};for(const [name,e] of Object.entries(expected)){const d=db.getSiblingDB(name);const info=d.getCollectionInfos();let docs=0,indexes=0,views=0;for(const x of info){if(x.type==='view'){views++;continue;}docs+=d.getCollection(x.name).countDocuments({});indexes+=d.getCollection(x.name).getIndexes().length;}print(JSON.stringify({kind:'restored_database',database:name,collections:info.length,documents:docs,indexes:indexes,views:views,counts_match:info.length===e.collections&&docs===e.documents}));}"
    r = call(['docker','exec',names[-1],'mongosh','--quiet','--eval',js])
    if r.returncode: emit('restored_database', query_ok=False)
    else:
        for line in r.stdout.splitlines():
            try:
                item=json.loads(line)
                if item.get('kind')=='restored_database': print(json.dumps(item,sort_keys=True))
            except (ValueError,AttributeError): pass
else: emit('restored_database', skipped=True, reason='isolation_or_limits_not_confirmed')
mem = {}
for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
    key, value = line.split(':',1)
    if key in ['MemTotal','MemAvailable','SwapTotal','SwapFree']: mem[key+'_kib'] = int(value.split()[0])
emit('memory', **mem)
for name in ['cpu','memory','io']:
    p=pathlib.Path('/proc/pressure')/name
    if p.is_file(): emit('pressure', resource=name, values=p.read_text().strip())
for args in [['df','-Pk','/'],['df','-Pi','/'],['vmstat','1','5']]:
    r=call(args)
    emit('resource_sample', tool=args[0], ok=r.returncode==0, output=r.stdout.strip() if r.returncode==0 else None)
r=call(['docker','stats','--no-stream','--format','{{json .}}',*names])
if r.returncode==0:
    for line in r.stdout.splitlines():
        try:
            x=json.loads(line);emit('container_resources',name=x.get('Name'),cpu=x.get('CPUPerc'),memory=x.get('MemUsage'),block_io=x.get('BlockIO'),pids=x.get('PIDs'))
        except ValueError: pass
else: emit('container_resources',available=False)
r=call(['journalctl','-k','--since','24 hours ago','-n','1500','--no-pager','-o','cat'])
text=r.stdout.lower()
emit('kernel_summary', readable=r.returncode==0, sampled_lines=len(text.splitlines()), oom_lines=sum('out of memory' in x or 'oom-kill' in x or 'killed process' in x for x in text.splitlines()), storage_error_lines=sum('input/output error' in x or 'i/o error' in x or 'no space left' in x for x in text.splitlines()))
emit('audit_finished', elapsed_seconds=round(time.monotonic()-started,3), writes_performed=False)
'@
$ApolloAudit | ssh -T -p 22022 -o StrictHostKeyChecking=yes $ApolloSshTarget python3 -
```

Este bloco não imprime documentos, .env, URI, senha ou logs brutos. Em caso de traceback, revisar localmente antes de compartilhar. A leitura de logs é limitada e sua contagem é heurística: zero não prova ausência de erros/OOM; flag OOMKilled tampouco cobre todo o histórico. As contagens não substituem reconciliação ou comparação dos índices. vmstat fornece amostra curta, não certifica capacidade em pico. O total de cinco containers referidos é uma expectativa a conferir; o bloco não enumera nem modifica containers de outros sites.

Para conferir arquivos privados, fornecer ao administrador local os caminhos exatos e os SHA-256 esperados da cópia original, do ciphertext e do plaintext recuperado. Calcular um arquivo de cada vez em baixa atividade. Não publicar nome de cliente, chave, backup ou conteúdo de sidecar. Na VPS, a leitura SHA-256 não precisa de chave GPG. Evitar varrer diretórios arbitrários ou usar comando de checksum fornecido por arquivo não confiável. Registrar apenas tipo de artefato, tamanho, horário UTC, hash esperado/observado e resultado. Sem hashes/caminhos exatos não há comparação verificável a executar.
