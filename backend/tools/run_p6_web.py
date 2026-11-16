"""Disposable localhost Mongo/FastAPI/Vite for real browser acceptance tests."""
import os, sys, tempfile, subprocess, time, json
from pathlib import Path
from pymongo import MongoClient
import httpx
root=Path(__file__).resolve().parents[2]
processes=[]
def launch(command,log,env,cwd=root):
    p=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env=env,cwd=cwd);processes.append(p);return p
with tempfile.TemporaryDirectory(prefix='apollo-p6-') as tmp:
    out=root/'docs/web/p6-2026-11-16/evidence';out.mkdir(parents=True,exist_ok=True)
    log=open(out/'runtime.log','w')
    env={**os.environ,'MONGO_URL':'mongodb://127.0.0.1:27028/?replicaSet=p6','DB_NAME':'apollo_p6_web','P6_DB_NAME':'apollo_p6_web',
         'COOKIE_SECURE':'false','APP_URL':'http://127.0.0.1:3001','NO_PROXY':'localhost,127.0.0.1','P6_PYTHON':sys.executable}
    try:
        mongo=launch([os.environ['MONGOD_BIN'],'--dbpath',tmp,'--port','27028','--bind_ip','127.0.0.1','--replSet','p6','--nounixsocket','--setParameter','enableTestCommands=1','--wiredTigerCacheSizeGB','0.25'],log,env)
        client=MongoClient('mongodb://127.0.0.1:27028',directConnection=True,serverSelectionTimeoutMS=500)
        for _ in range(100):
            if mongo.poll() is not None:raise RuntimeError('Mongo stopped; see runtime.log')
            try:client.admin.command('ping');break
            except Exception:time.sleep(.1)
        client.admin.command('replSetInitiate',{'_id':'p6','members':[{'_id':0,'host':'127.0.0.1:27028'}]})
        for _ in range(100):
            if client.admin.command('hello').get('isWritablePrimary'):break
            time.sleep(.1)
        subprocess.run([sys.executable,str(root/'backend/tools/p6_fixture.py'),'reset'],env=env,check=True)
        launch([sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port','8001'],log,env,root/'backend')
        launch([str(root/'frontend/node_modules/.bin/vite'),'--config','vite.web.config.ts'],log,env,root/'frontend')
        with httpx.Client(trust_env=False,timeout=1) as h:
            for url in ('http://127.0.0.1:8001/api/','http://127.0.0.1:3001/login'):
                for _ in range(100):
                    try:
                        if h.get(url).status_code==200:break
                    except httpx.TransportError:pass
                    time.sleep(.2)
                else:raise RuntimeError('Server not ready: '+url)
        cert=Path(tmp)/'test.crt';key=Path(tmp)/'test.key'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],check=True,stdout=log,stderr=log)
        tls_env={**env,'COOKIE_SECURE':'true','APP_URL':'https://127.0.0.1:8443'}
        launch([sys.executable,'-m','uvicorn','server:app','--host','127.0.0.1','--port','8443','--ssl-certfile',str(cert),'--ssl-keyfile',str(key)],log,tls_env,root/'backend')
        with httpx.Client(base_url='https://127.0.0.1:8443',verify=str(cert),trust_env=False,timeout=2) as tls:
            for _ in range(100):
                try:
                    if tls.get('/api/').status_code==200:break
                except httpx.TransportError:pass
                time.sleep(.2)
            response=tls.post('/api/auth/login',json={'username':'p6-caixa','password':'Synthetic-P6-Test-Only!'},headers={'Origin':'https://127.0.0.1:8443'})
            assert response.status_code==200
            cookie=response.headers['set-cookie'].lower()
            assert 'secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie
            assert tls.get('/api/auth/me').status_code==200
            hostile=tls.post('/api/cash/open',json={'opening_amount':0},headers={'Origin':'http://127.0.0.1:8443'})
            assert hostile.status_code==403
            cors=tls.options('/api/auth/me',headers={'Origin':'https://hostile.invalid','Access-Control-Request-Method':'GET'})
            assert 'access-control-allow-origin' not in cors.headers
            (out/'tls-security.json').write_text(json.dumps({'tls_certificate_verified':True,'secure_cookie':True,'httpOnly':True,'sameSite':'lax','authenticated_https':True,'cross_scheme_csrf_status':hostile.status_code,'hostile_cors_not_allowed':True,'scope':'localhost synthetic certificate; no production infrastructure certified'},indent=2)+'\n')
        if '--tls-only' in sys.argv: raise SystemExit(0)
        command=['npx','playwright','test','--config','p6.playwright.config.ts',*sys.argv[1:]]
        result=subprocess.run(command,env=env,cwd=root/'tests')
        raise SystemExit(result.returncode)
    finally:
        for p in reversed(processes):
            p.terminate()
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        log.close()
