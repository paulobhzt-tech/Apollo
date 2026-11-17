"""Destructive rehearsal ONLY inside a disposable GitHub runner; never on a VPS."""
import concurrent.futures,hashlib,json,os,re,secrets,subprocess,sys,tempfile,time
from pathlib import Path
import httpx
root=Path(__file__).resolve().parents[2]
assert os.environ.get('GITHUB_ACTIONS')=='true','Disposable GitHub runner only'
bundle=root/'p104-output/bundle';out=root/'p104-output/rehearsal';out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((bundle/'manifest.json').read_text())
for name,info in manifest['files'].items():
    assert hashlib.sha256((bundle/name).read_bytes()).hexdigest()==info['sha256'],name
log=(out/'rehearsal.log').open('w');started=time.monotonic();events=[];all_secret_values=[]

def run(args,**kw):return subprocess.run(args,check=True,stdout=kw.pop('stdout',log),stderr=kw.pop('stderr',log),**kw)

def mark(name,**details):events.append({'stage':name,'elapsed_seconds':round(time.monotonic()-started,3),**details})

projects=[]
with tempfile.TemporaryDirectory(prefix='p104-rehearsal-') as directory:
    tmp=Path(directory);certs=tmp/'certs';certs.mkdir()
    run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(certs/'test.key'),'-out',str(certs/'test.crt'),
         '-days','1','-subj','/CN=homolog.apollo-pdv.com','-addext','subjectAltName=DNS:homolog.apollo-pdv.com,IP:127.0.0.1'])
    run(['sudo','chown','101:101',str(certs/'test.key')]);run(['sudo','chmod','400',str(certs/'test.key')])
    for archive in ['mongo.docker.tar','nginx.docker.tar','apollo-web.docker.tar']:
        run(['docker','load','-i',str(bundle/archive)])
    run([sys.executable,str(bundle/'verify_package.py'),str(bundle),'--loaded-images'])
    mark('verified_archive_loaded')
    def create_project(suffix):
        private=tmp/suffix;private.mkdir();secretdir=private/'secrets';recovery=private/'recovery';recovery.mkdir()
        run(['sudo',sys.executable,str(bundle/'generate_secrets.py'),str(secretdir),'--container-owners'])
        for name in ['mongo_password','root_password','replica.key','bootstrap_token','mongo_uri']:
            v=subprocess.check_output(['sudo','cat',str(secretdir/name)],text=True).strip();all_secret_values.append(v)
        pin=str(secrets.randbelow(800000)+100000)
        while len(set(pin))==1 or pin in ('123456','654321'):pin=str(secrets.randbelow(800000)+100000)
        owner={'username':'p104-'+suffix,'password':secrets.token_urlsafe(36),'pin':pin,'name':'Fictício '+suffix}
        ownerfile=recovery/'owner.json';ownerfile.write_text(json.dumps(owner));ownerfile.chmod(0o600)
        all_secret_values.extend([owner['password'],owner['pin']])
        recovery.chmod(0o700);run(['sudo','chown','-R','10001:10001',str(recovery)])
        env={**os.environ,'P10_SECRETS_DIR':str(secretdir),'P10_CERTS_DIR':str(certs),
             'P104_RECOVERY_DIR':str(recovery),'APOLLO_RECOVERY_ACK':'SYNTHETIC_RECOVERY_ONLY','P104_WEB_IMAGE':manifest['image']}
        alias=private/'lab-ports.yml';alias.write_text('services:\n  proxy:\n    ports: ["127.0.0.1:443:8443"]\n')
        prefix=['docker','compose','-p','apollo-p104-'+suffix,'-f',str(bundle/'compose.yml'),'-f',str(alias)]
        def dc(*args,capture=False,**kw):
            if capture:kw.update(stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            return run([*prefix,*args],env=env,**kw)
        projects.append((dc,secretdir))
        dc('config','--quiet');dc('up','-d','p10-mongo')
        for _ in range(90):
            p=subprocess.run([*prefix,'exec','-T','p10-mongo','mongosh','--quiet','/opt/p10/replica-init.js'],env=env,stdout=log,stderr=log)
            if p.returncode==0:break
            time.sleep(2)
        else:raise RuntimeError('Replica initialization timeout')
        return dc,owner,recovery,env
    def ready(dc):
        dc('up','-d','web');dc('--profile','tls-test','up','-d','proxy')
        for _ in range(90):
            try:
                with httpx.Client(verify=str(certs/'test.crt'),trust_env=False,timeout=3,headers={'Host':'homolog.apollo-pdv.com'}) as c:
                    if c.get('https://127.0.0.1:18443/api/health/ready').status_code==200:return
            except httpx.TransportError:pass
            time.sleep(1)
        raise RuntimeError('TLS readiness timeout')
    from p104_http import authenticated_client
    def client(owner):return authenticated_client(owner,verify=str(certs/'test.crt'))
    def api(c,method,path,data=None,status=200):
        r=c.request(method,'/api'+path,json=data);assert r.status_code==status,(path,r.status_code,r.text[:200])
        return r.json()
    def snapshot(dc):
        code="""import asyncio,json
from tools.p10_environment import environment
environment()
from lib.db import db
async def main():
 orders=await db.orders.find({},{'_id':0,'id':1,'number':1,'client_ref':1,'status':1,'total':1}).to_list(None)
 stock=await db.ingredients.find_one({'name':'Fictício insumo'})
 lots=await db.purchases.find({},{'_id':0,'remaining_qty':1}).to_list(None)
 cash=await db.cash_sessions.find_one({},{'_id':0})
 print(json.dumps({'orders':orders,'stock':stock['stock'],'lots':sum(x['remaining_qty'] for x in lots),'cash_difference':cash.get('difference'), 'markers':await db.financial_operations.count_documents({'kind':'pdv_sale'})},default=str))
asyncio.run(main())
"""
        value=json.loads(dc('exec','-T','web','python','-',input=code,text=True,capture=True).stdout)
        assert value['stock']==value['lots']==100 and value['markers']==2 and value['cash_difference']==0
        assert len(value['orders'])==2 and len({o['number'] for o in value['orders']})==2 and len({o['client_ref'] for o in value['orders']})==2
        assert all(o['status']=='cancelado' for o in value['orders'])
        return value
    try:
        dc,owner,recovery,env=create_project('source')
        prep=json.loads(dc('--profile','recovery','run','--rm','--no-deps','recovery','prepare-target','--owner-file','/recovery/owner.json',capture=True).stdout)
        ready(dc);mark('private_replica_and_tls_ready')
        with httpx.Client(trust_env=False,timeout=5,headers={'Host':'homolog.apollo-pdv.com'}) as direct:
            assert direct.get('http://172.31.240.2:10000/api/health/ready').status_code==200
        cid=dc('ps','-q','web',capture=True).stdout.strip()
        inspected=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
        assert not inspected['HostConfig']['PortBindings']
        assert inspected['Config']['User']=='10001:10001' and inspected['HostConfig']['ReadonlyRootfs']
        assert all('private' in n for n in inspected['NetworkSettings']['Networks'])
        dc('exec','-T','web','python','-c',"from pathlib import Path;assert not Path('/run/secrets/bootstrap_token').exists()")
        mark('host_private_bridge_verified_no_web_port_published')
        run([sys.executable,str(root/'backend/tools/p104_apache_lab.py')],env={**os.environ,'P104_CERTS_DIR':str(certs)})
        mark('almalinux9_apache_tls_and_ip_deny_passed')
        with client(owner) as c:
            assert c.get('/login').status_code==200 and c.get('/api/auth/me').status_code==200
            assert c.get('/api/drive/connect').status_code==403 and c.post('/api/backup/restore',json={}).status_code==403
            assert c.post('/api/auth/first-access',json={'username':'fake-owner','password':'Fictitious-only-password!','pin':'617394'}).status_code in (403,404)
            assert c.post('/api/cash/open',json={'opening_amount':0},headers={'Origin':'https://hostile.invalid'}).status_code==403
            category=api(c,'POST','/categories',{'name':'Fictício categoria'})
            ing=api(c,'POST','/ingredients',{'name':'Fictício insumo','unit':'un','stock':0,'cost_per_unit':1})
            supplier=api(c,'POST','/suppliers',{'name':'Fictício fornecedor'})
            api(c,'POST','/purchases',{'supplier_id':supplier['id'],'ingredient_id':ing['id'],'qty':100,'unit_cost':1,'lot_number':'FICTICIO','expiry_date':'2099-12-31'})
            product=api(c,'POST','/products',{'name':'Fictício produto','category_id':category['id'],'price':10,'recipe':[{'ingredient_id':ing['id'],'qty':1}]})
            api(c,'POST','/cash/open',{'opening_amount':100})
            body={'client_ref':'p104-replay','items':[{'product_id':product['id'],'qty':1}],'payments':[{'method':'pix','amount':10}],'emit_invoice':False,'send_to_kitchen':True}
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
                replies=list(pool.map(lambda _:api(c,'POST','/pdv/sale',body),range(10)))
            assert len({x['order']['id'] for x in replies})==1
            oid=replies[0]['order']['id']
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
                list(pool.map(lambda _:api(c,'POST','/orders/'+oid+'/cancel',{'reason':'Cancelamento fictício concorrente'}),range(10)))
            body.update(client_ref='p104-refund',items=[{'product_id':product['id'],'qty':1},{'product_id':product['id'],'qty':1}],payments=[{'method':'dinheiro','amount':20}])
            sale=api(c,'POST','/pdv/sale',body)['order']
            api(c,'POST',f"/orders/{sale['id']}/items/{sale['items'][0]['id']}/refund",{'reason':'Estorno fictício parcial'})
            api(c,'POST','/orders/'+sale['id']+'/cancel',{'reason':'Cancelamento fictício restante'})
            closed=api(c,'POST','/cash/close',{'counted_amount':100});assert closed['difference']==0
            before=snapshot(dc)
            assert hashlib.sha256(c.get('/login').content).hexdigest()==manifest['dist_web_index_sha256']
            run(['node',str(root/'tests/p104-browser-smoke.mjs')],input=json.dumps(owner),text=True,env={**os.environ,'P104_BROWSER_EVIDENCE':str(out)})
            assert c.post('/api/auth/logout',json={}).status_code==200 and c.get('/api/auth/me').status_code==401
        mark('sale_cancel_refund_concurrency_and_reconciliation',snapshot=before)
        backup=json.loads(dc('--profile','recovery','run','--rm','--no-deps','recovery','backup','/recovery/source.json',capture=True).stdout)
        # Authenticated encrypted transport of the fictitious backup, key never uploaded.
        agekey=tmp/'age.key';run(['age-keygen','-o',str(agekey)])
        recipient=subprocess.check_output(['age-keygen','-y',str(agekey)],text=True).strip()
        all_secret_values.append(agekey.read_text().splitlines()[-1])
        encrypted=tmp/'source.json.age';plain=tmp/'source-recovered.json'
        run(['sudo','age','-r',recipient,'-o',str(encrypted),str(recovery/'source.json')])
        run(['sudo','age','-d','-i',str(agekey),'-o',str(plain),str(encrypted)])
        recovered_hash=subprocess.check_output(['sudo','sha256sum',str(plain)],text=True).split()[0]
        assert recovered_hash==backup['backup_sha256']
        mark('encrypted_backup_roundtrip',cipher_sha256=subprocess.check_output(['sudo','sha256sum',str(encrypted)],text=True).split()[0])
        # Snapshot/restart and transient disconnect; only disposable source project.
        dc('stop','web');dc('start','web');ready(dc)
        dc('stop','p10-mongo')
        with httpx.Client(verify=str(certs/'test.crt'),trust_env=False,timeout=45,headers={'Host':'homolog.apollo-pdv.com'}) as unavailable:
            assert unavailable.get('https://127.0.0.1:18443/api/health/ready').status_code==503
        mark('mongo_connection_failure_readiness_503_observed')
        dc('start','p10-mongo');ready(dc)
        assert snapshot(dc)==before
        mark('backend_and_mongo_restart_preserved_state')
        stats=dc('stats','--no-stream','--format','json',capture=True).stdout
        (out/'resources-source.jsonl').write_text(stats)
        dc('--profile','tls-test','down')  # Preserve source volume and secrets for withdrawal rollback.
        target,to,tdir,tenv=create_project('restore')
        target('--profile','recovery','run','--rm','--no-deps','recovery','prepare-target','--owner-file','/recovery/owner.json',capture=True)
        token=json.loads(target('--profile','recovery','run','--rm','--no-deps','recovery','inspect-target',capture=True).stdout)['target_id']
        # age may create a 0644 plaintext under the runner's umask. Stage privately
        # before invoking the strict recovery reader; do not weaken that reader.
        run(['sudo','install','-m','600','-o','10001','-g','10001',str(plain),str(tdir/'source.json')])
        assert subprocess.check_output(['sudo','stat','-c','%a:%u:%g',str(tdir/'source.json')],text=True).strip()=='600:10001:10001'
        # Corrupt checksum and target ID must be refused, with no writes.
        for expected_hash,expected_target in [('0'*64,token),(backup['backup_sha256'],'0'*64)]:
            p=subprocess.run(['docker','compose','-p','apollo-p104-restore','-f',str(bundle/'compose.yml'),'--profile','recovery','run','--rm','--no-deps','recovery','restore','/recovery/source.json','--sha256',expected_hash,'--expect-target',expected_target],env=tenv,stdout=log,stderr=log)
            assert p.returncode!=0
        restored=json.loads(target('--profile','recovery','run','--rm','--no-deps','recovery','restore','/recovery/source.json','--sha256',backup['backup_sha256'],'--expect-target',token,capture=True).stdout)
        ready(target)
        assert snapshot(target)==before
        with client(to) as c:assert c.get('/api/auth/me').status_code==200
        # Used/nonempty target and second restore are prohibited.
        p=subprocess.run(['docker','compose','-p','apollo-p104-restore','-f',str(bundle/'compose.yml'),'--profile','recovery','run','--rm','--no-deps','recovery','restore','/recovery/source.json','--sha256',backup['backup_sha256'],'--expect-target',token],env=tenv,stdout=log,stderr=log)
        assert p.returncode!=0
        mark('separate_authenticated_restore_and_negative_guards',backup=backup,restored=restored)
        target('--profile','tls-test','down')
        # First-release rollback: restore original volume/network and reimport tested image; no arbitrary older image.
        run(['docker','load','-i',str(bundle/'apollo-web.docker.tar')]);dc('up','-d','p10-mongo');ready(dc)
        assert snapshot(dc)==before
        with client(owner) as c:assert c.get('/api/health/ready').status_code==200
        dc('--profile','tls-test','stop');mark('withdrawal_rollback_source_recovered_then_stopped')
        result={'verdict':'PASS','source_head':manifest['source_head'],'image_id':manifest['docker_image_id'],
          'loaded_from_retained_archive':True,'tls_lab_verified':True,'bootstrap_secret_not_mounted':True,
          'authenticated_mongo':True,'financial_concurrency':10,'duplicates':0,'financial_divergences':0,
          'separate_restore':True,'encrypted_backup_roundtrip':True,'checksum_wrong_target_nonempty_refused':True,'restart_preserved':True,'mongo_unavailable_503_observed':True,'final_image_browser_smoke':True,
          'rollback':'First-release withdrawal and original volume recovery; no previous-release code rollback claimed',
          'vps_tested':False,'public_https_tested':False,'human_tested':False,'production_approved':False,'events':events}
    finally:
        for project,secretdir in reversed(projects):
            try:project('--profile','tls-test','logs','--no-color');project('--profile','tls-test','down','--volumes','--remove-orphans')
            except subprocess.CalledProcessError:pass
            run(['sudo','rm','-rf',str(secretdir)])
        log.close();content=(out/'rehearsal.log').read_text();leaked=False
        content=re.sub(r'(?i)(?:set-cookie|cookie):[^\n\r]*', '[REDACTED COOKIE HEADER]', content)
        for value in all_secret_values:
            if value and value in content:content=content.replace(value,'[REDACTED]');leaked=True
        (out/'rehearsal.log').write_text(content)
        subprocess.run(['sudo','rm','-rf',str(tmp)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if leaked:raise RuntimeError('Generated secret appeared in logs (redacted)')
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
