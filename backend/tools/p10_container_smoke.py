"""GitHub runner only: build and test private P10 containers, then remove them."""
import os, sys, subprocess, tempfile, time, json, hashlib
from pathlib import Path
import httpx
root=Path(__file__).resolve().parents[2]
assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Disposable GitHub runner only; never run on a VPS'
out=root/'docs/web/p10-2026-11-16/evidence/container';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='apollo-p10-container-') as tmp:
    tmp=Path(tmp);secrets=tmp/'secrets';certs=tmp/'certs';certs.mkdir()
    env={**os.environ,'P10_SECRETS_DIR':str(secrets),'P10_CERTS_DIR':str(certs),'P10_IMAGE_TAG':os.environ.get('GITHUB_SHA','ci')}
    compose=['docker','compose','-p','apollo-p10-ci','-f',str(root/'deploy/p10/compose.yml')]
    def run(args,**kw):return subprocess.run(args,env=env,cwd=root,check=True,**kw)
    def dc(*args,**kw):return run([*compose,*args],**kw)
    log=(out/'container.log').open('w')
    try:
        run(['sudo',sys.executable,str(root/'deploy/p10/generate_secrets.py'),str(secrets),'--container-owners'],stdout=log,stderr=log)
        run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(certs/'test.key'),'-out',str(certs/'test.crt'),
             '-days','1','-subj','/CN=homolog.apollo-pdv.com','-addext','subjectAltName=DNS:homolog.apollo-pdv.com,IP:127.0.0.1'],stdout=log,stderr=log)
        run(['sudo','chown','101:101',str(certs/'test.key')]);run(['sudo','chmod','400',str(certs/'test.key')])
        dc('config','--quiet',stdout=log,stderr=log)
        dc('build','web',stdout=log,stderr=log)
        dc('up','-d','p10-mongo',stdout=log,stderr=log)
        ready=False
        for _ in range(100):
            result=subprocess.run([*compose,'exec','-T','p10-mongo','mongosh','--quiet','/opt/p10/replica-init.js'],env=env,cwd=root,stdout=log,stderr=log)
            if result.returncode==0:ready=True;break
            time.sleep(2)
        assert ready,'Replica initialization failed'
        dc('run','--rm','--no-deps','web','python','tools/p10_environment.py','init',stdout=log,stderr=log)
        dc('up','-d','web',stdout=log,stderr=log)
        # Bootstrap inside the container: credentials only on stdin/runtime secret files.
        code="""import json,urllib.request,os;from pathlib import Path
payload={'username':'p10-ci-admin','password':'Synthetic-P10-Docker-Only!','pin':'617394','name':'Administrador fictício Docker'}
token=Path(os.environ['APOLLO_BOOTSTRAP_TOKEN_FILE']).read_text().strip()
request=urllib.request.Request('http://127.0.0.1:10000/api/auth/first-access',data=json.dumps(payload).encode(),headers={'Host':'homolog.apollo-pdv.com','Origin':'https://homolog.apollo-pdv.com','Content-Type':'application/json','X-Apollo-Bootstrap':token})
assert urllib.request.urlopen(request,timeout=20).status==200
"""
        for _ in range(100):
            result=subprocess.run([*compose,'exec','-T','web','python','-c',"import urllib.request;assert urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:10000/api/health/ready',headers={'Host':'homolog.apollo-pdv.com'}),timeout=2).status==200"],env=env,cwd=root,stdout=log,stderr=log)
            if result.returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Container readiness failed')
        dc('exec','-T','web','python','-',input=code,text=True,stdout=log,stderr=log)
        dc('--profile','tls-test','up','-d','proxy',stdout=log,stderr=log)
        dc('exec','-T','proxy','nginx','-t',stdout=log,stderr=log)
        headers={'Host':'homolog.apollo-pdv.com','Origin':'https://homolog.apollo-pdv.com'}
        with httpx.Client(base_url='https://127.0.0.1:18443',verify=str(certs/'test.crt'),headers=headers,trust_env=False,timeout=30) as client:
            for _ in range(60):
                try:
                    if client.get('/api/health/ready').status_code==200:break
                except httpx.TransportError:pass
                time.sleep(1)
            else:raise RuntimeError('TLS proxy not ready')
            entry=client.get('/login');assert entry.status_code==200
            digest=dc('exec','-T','web','python','-c',"import hashlib;from pathlib import Path;print(hashlib.sha256(Path('/app/web/index.html').read_bytes()).hexdigest())",capture_output=True,text=True).stdout.strip()
            assert hashlib.sha256(entry.content).hexdigest()==digest
            login=client.post('/api/auth/login',json={'username':'p10-ci-admin','password':'Synthetic-P10-Docker-Only!'})
            assert login.status_code==200
            assert all(x in login.headers['set-cookie'].lower() for x in ('secure','httponly','samesite=lax'))
            assert client.get('/api/auth/me').status_code==200
            assert client.get('/api/drive/connect').status_code==403
            assert client.post('/api/cron/nightly-backup',json={}).status_code==403
            assert client.post('/api/cash/open',json={'opening_amount':0},headers={'Origin':'https://hostile.invalid'}).status_code==403
            assert client.get('/api/nonexistent').status_code==404
            assert client.get('/api/').headers['x-apollo-environment']=='HOMOLOGACAO'
            assert "frame-ancestors 'none'" in entry.headers['content-security-policy']
        for flag in ['APOLLO_ENV=production','DB_NAME=production','APOLLO_EXTERNAL_INTEGRATIONS=enabled','GOOGLE_CLIENT_SECRET=Synthetic-Prohibited']:
            result=subprocess.run([*compose,'run','--rm','--no-deps','-e',flag,'web'],env=env,cwd=root,stdout=log,stderr=log)
            assert result.returncode!=0,'Unsafe mode unexpectedly started'
        guard="""from tools.p10_environment import environment
from lib.homologation import install_egress_guard
import socket
install_egress_guard(environment())
try: socket.create_connection(('203.0.113.1',443),timeout=.1)
except PermissionError: pass
else: raise RuntimeError('Egress guard failed')
"""
        dc('exec','-T','web','python','-',input=guard,text=True,stdout=log,stderr=log)
        cid=dc('ps','-q','web',capture_output=True,text=True).stdout.strip()
        inspect=json.loads(run(['docker','inspect',cid],capture_output=True,text=True).stdout)[0]
        assert inspect['Config']['User']=='10001:10001' and inspect['HostConfig']['ReadonlyRootfs']
        assert all('private' in name for name in inspect['NetworkSettings']['Networks'])
        image=dc('images','-q','web',capture_output=True,text=True).stdout.strip()
        result={'verdict':'PASS','tls_certificate_verified':True,'dist_web_index_verified':True,'mongo_replica_authenticated':True,
          'bootstrap_secret_gated':True,'secure_httpOnly_cookie':True,'hostile_csrf_blocked':True,'external_routes_and_tcp_blocked':True,
          'unsafe_startup_rejected':True,'nonroot_readonly_private_network':True,'image_id':image,'production_deployment':False}
        (out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
    finally:
        subprocess.run([*compose,'--profile','tls-test','logs','--no-color'],env=env,cwd=root,stdout=log,stderr=log)
        subprocess.run([*compose,'--profile','tls-test','down','--volumes','--remove-orphans'],env=env,cwd=root,stdout=log,stderr=log)
        log.close();subprocess.run(['sudo','rm','-rf',str(secrets)],check=True)
