"""AlmaLinux 9 Apache loopback-only proxy lab. No Virtualmin/VPS access."""
import hashlib,json,os,subprocess,tempfile,time
from pathlib import Path
import httpx
assert os.environ.get('GITHUB_ACTIONS')=='true'
root=Path(__file__).resolve().parents[2];out=root/'p104-output/rehearsal';out.mkdir(parents=True,exist_ok=True)
certs=Path(os.environ['P104_CERTS_DIR'])
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
with tempfile.TemporaryDirectory(prefix='p104-alma-') as tmp:
    tmp=Path(tmp);tag='almalinux:9';run('docker','pull',tag)
    info=json.loads(run('docker','image','inspect',tag,capture_output=True,text=True).stdout)[0]
    base=info['RepoDigests'][0]
    (tmp/'Dockerfile').write_text('FROM '+base+'\nRUN dnf -y install httpd mod_ssl && dnf clean all\n')
    run('docker','build','-t','apollo-p104-apache-lab',str(tmp))
    original=(root/'deploy/p10/apache-virtualmin.conf.example').read_text()
    original=original.replace('http://127.0.0.1:18082/','http://172.31.240.2:10000/')
    original=original.replace('*:443','127.0.0.1:19443').replace('/APPROVED/P10/fullchain.pem','/lab/test.crt').replace('/APPROVED/P10/privkey.pem','/lab/test.key')
    prefix='ServerRoot /etc/httpd\nServerName homolog.apollo-pdv.com\nListen 127.0.0.1:19443\nPidFile /tmp/p104-httpd.pid\nErrorLog /dev/stderr\nLogLevel warn\nUser apache\nGroup apache\n'
    for module in ['mpm_event','unixd','authz_core','authz_host','ssl','proxy','proxy_http','headers','log_config']:
        prefix+=f'LoadModule {module}_module modules/mod_{module}.so\n'
    conf=tmp/'httpd.conf';conf.write_text(prefix+original)
    cid=None;results={}
    try:
        for phase,expected in [('permitted',200),('denied',403)]:
            if cid:run('docker','rm','-f',cid);cid=None
            if phase=='denied':conf.write_text((prefix+original).replace('Require local','Require ip 192.0.2.77'))
            run('docker','run','--rm','--network','host','-v',str(certs)+':/lab:ro','-v',str(conf)+':/lab.conf:ro','apollo-p104-apache-lab','httpd','-t','-f','/lab.conf')
            cid=run('docker','run','-d','--network','host','-v',str(certs)+':/lab:ro','-v',str(conf)+':/lab.conf:ro','apollo-p104-apache-lab','httpd','-DFOREGROUND','-f','/lab.conf',capture_output=True,text=True).stdout.strip()
            with httpx.Client(base_url='https://127.0.0.1:19443',verify=str(certs/'test.crt'),trust_env=False,timeout=5,headers={'Host':'homolog.apollo-pdv.com'}) as client:
                for _ in range(60):
                    try:
                        response=client.get('/api/health/ready')
                        if response.status_code==expected:break
                    except httpx.TransportError:pass
                    time.sleep(1)
                else:raise RuntimeError('Apache TLS/allowlist failed')
                results[phase]=response.status_code
                if phase=='permitted':
                    assert client.get('/login').status_code==200
                    assert client.get('/api/health/ready',headers={'Host':'unknown.invalid'}).status_code==400
        version=run('docker','run','--rm','apollo-p104-apache-lab','httpd','-v',capture_output=True,text=True).stdout.strip()
        (out/'apache-alma.json').write_text(json.dumps({'verdict':'PASS','base':base,'apache':version,'http':results,'tls_verified':True,'syntax_valid':True,'host_unknown_rejected':True,'loopback_only':True,'selinux_enforcing_tested':False,'virtualmin_tested':False,'vps_tested':False},indent=2)+'\n')
    finally:
        if cid:run('docker','logs',cid);run('docker','rm','-f',cid)
