"""P10 built Web + TLS + real disposable Mongo. No Vite API mocks."""
import os, sys, subprocess, tempfile, time, json, uuid, threading
from pathlib import Path
from pymongo import MongoClient
import httpx
root=Path(__file__).resolve().parents[2]
children=[]
out=Path(os.environ.get('P10_EVIDENCE',root/'docs/web/p10-2026-11-16/evidence/local'))
out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='apollo-p10-') as tmp, (out/'runtime.log').open('w') as log:
    cfg={**os.environ,'APOLLO_ENV':'homologation','APOLLO_DEMO_MODE':'true','APOLLO_P10_DISPOSABLE_RUNNER':'1',
      'APOLLO_HOMOLOGATION_ACK':'SYNTHETIC_ONLY_NO_REAL_DATA','APOLLO_EXTERNAL_INTEGRATIONS':'disabled',
      'COOKIE_SECURE':'true','APP_URL':'https://127.0.0.1:8444','CORS_ORIGINS':'',
      'MONGO_URL':'mongodb://127.0.0.1:27030/?replicaSet=p10','DB_NAME':'apollo_p10_test_'+uuid.uuid4().hex,
      'SERVE_FRONTEND_DIR':str(root/'frontend/dist-web'),'P10_CONTROL_FILE':str(Path(tmp)/'control.json'),
      'P10_PYTHON':sys.executable,'NO_PROXY':'127.0.0.1,localhost'}
    def launch(command,cwd=root):
        child=subprocess.Popen(command,cwd=cwd,env=cfg,stdout=log,stderr=subprocess.STDOUT);children.append(child);return child
    try:
        mongo_command=[os.environ['MONGOD_BIN'],'--dbpath',tmp,'--port','27030','--bind_ip','127.0.0.1',
          '--replSet','p10','--nounixsocket','--setParameter','enableTestCommands=1','--wiredTigerCacheSizeGB','0.25']
        mongo=launch(mongo_command)
        client=MongoClient('mongodb://127.0.0.1:27030',directConnection=True,serverSelectionTimeoutMS=500)
        for _ in range(100):
            if mongo.poll() is not None:raise RuntimeError('Mongo failed; inspect runtime.log')
            try:client.admin.command('ping');break
            except Exception:time.sleep(.1)
        client.admin.command('replSetInitiate',{'_id':'p10','members':[{'_id':0,'host':'127.0.0.1:27030'}]})
        for _ in range(100):
            if client.admin.command('hello').get('isWritablePrimary'):break
            time.sleep(.1)
        subprocess.run([sys.executable,str(root/'backend/tools/p10_environment.py'),'init'],env=cfg,check=True,stdout=log,stderr=log)
        subprocess.run([sys.executable,str(root/'backend/tools/p10_fixture.py'),'reset'],env=cfg,check=True,stdout=log,stderr=log)
        cert=Path(tmp)/'tls.crt';key=Path(tmp)/'tls.key'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),
          '-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],check=True,stdout=log,stderr=log)
        backend_command=[sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port','8444',
          '--ssl-certfile',str(cert),'--ssl-keyfile',str(key)]
        backend=launch(backend_command,root/'backend')
        with httpx.Client(base_url=cfg['APP_URL'],verify=str(cert),trust_env=False,timeout=2) as http:
            for _ in range(150):
                if backend.poll() is not None:raise RuntimeError('Backend failed; inspect runtime.log')
                try:
                    if http.get('/api/health/ready').status_code==200:break
                except httpx.TransportError:pass
                time.sleep(.2)
            else:raise RuntimeError('Readiness failed')
            entry=http.get('/login');assert entry.status_code==200
            assert entry.text==(root/'frontend/dist-web/index.html').read_text()
            assert http.get('/api/nonexistent').status_code==404
            assert http.get('/api/demo-status').json()['homologation'] is True
            cookie=http.post('/api/auth/login',json={'username':'p10-admin','password':'Synthetic-P10-Test-Only!'},headers={'Origin':cfg['APP_URL']})
            assert cookie.status_code==200
            assert all(value in cookie.headers['set-cookie'].lower() for value in ['secure','httponly','samesite=lax'])
            assert http.post('/api/cash/open',json={'opening_amount':0},headers={'Origin':'http://127.0.0.1:8444'}).status_code==403
            assert http.get('/api/drive/connect').status_code==403
            assert http.get('/api/auth/profiles').json()==[]
            assert http.get('/api/').headers['x-apollo-environment']=='HOMOLOGACAO'
        (out/'preflight.json').write_text(json.dumps({'tls_certificate_verified':True,'serves_dist_web_index':True,
          'readiness':True,'secure_httponly_cookie':True,'cross_scheme_csrf_blocked':True,'external_routes_blocked':True,
          'synthetic_database':cfg['DB_NAME'],'mongo_version':client.server_info()['version'],'scope':'disposable loopback HTTPS only'},indent=2)+'\n')
        stopped=threading.Event()
        def control():
            global backend, mongo
            control_file=Path(cfg['P10_CONTROL_FILE'])
            while not stopped.wait(.1):
                if not control_file.exists():continue
                try:
                    action=json.loads(control_file.read_text())['action'];control_file.unlink()
                    if action=='backend':
                        backend.kill();backend.wait(timeout=10);backend=launch(backend_command,root/'backend')
                    elif action=='mongo':
                        mongo.kill();mongo.wait(timeout=10);mongo=launch(mongo_command)
                    else:raise RuntimeError('Unknown recovery action')
                    ready=False
                    with httpx.Client(base_url=cfg['APP_URL'],verify=str(cert),trust_env=False,timeout=2) as health:
                        for _ in range(150):
                            try:
                                if health.get('/api/health/ready').status_code==200:ready=True;break
                            except httpx.TransportError:pass
                            time.sleep(.2)
                    Path(str(control_file)+'.done').write_text(json.dumps({'ready':ready,'action':action}))
                except Exception as error:
                    Path(str(control_file)+'.done').write_text(json.dumps({'ready':False,'error':type(error).__name__}))
        controller=threading.Thread(target=control,daemon=True);controller.start()
        result=subprocess.run(['npx','playwright','test','--config','p10.playwright.config.ts',*sys.argv[1:]],
          cwd=root/'tests',env=cfg)
        stopped.set();controller.join(timeout=5)
        raise SystemExit(result.returncode)
    finally:
        for child in reversed(children):
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait()
