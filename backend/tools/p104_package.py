"""Build, retain and inspect offline images on a disposable GitHub runner only."""
import hashlib,json,os,re,shutil,subprocess,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
assert os.environ.get('GITHUB_ACTIONS')=='true','Disposable GitHub runner only'
out=root/'p104-output';out.mkdir(exist_ok=True)
bundle=out/'bundle';bundle.mkdir(exist_ok=True)
context=out/'context';context.mkdir(exist_ok=True)

def run(*args,**kw):
    return subprocess.run(args,cwd=root,check=True,**kw)

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

head=run('git','rev-parse','HEAD',capture_output=True,text=True).stdout.strip()
epoch=run('git','show','-s','--format=%ct','526dd72b78d57b7799fc995af42e0fe925c04379',capture_output=True,text=True).stdout.strip()
# Archive only committed application input. No workspace .env, backup, fixture or credentials.
for name in ['frontend','backend/lib','backend/models','backend/routers']:
    shutil.copytree(root/name,context/name,ignore=shutil.ignore_patterns('node_modules','__pycache__','.env*','dist','dist-web','*.pyc'))
(context/'backend/tools').mkdir(parents=True)
for name in ['backend/server.py','backend/tools/p10_environment.py','backend/tools/p104_recovery.py']:
    shutil.copy(root/name,context/name)
shutil.copy(root/'deploy/p10/package/Dockerfile',context/'Dockerfile')
wheels=context/'wheels';wheels.mkdir()
# Fetch every transitive version already observed in the approved runtime; hash each wheel.
run(sys.executable,'-m','pip','download','--only-binary=:all:','--no-deps','--platform','manylinux_2_17_x86_64','--platform','manylinux_2_28_x86_64','--python-version','312','--implementation','cp','--abi','cp312','--abi','abi3','--abi','none','-r',str(root/'deploy/p10/package/requirements.resolved.txt'),'-d',str(wheels))
resolved={}
from packaging.utils import parse_wheel_filename
for p in wheels.glob('*.whl'):
    name,version,_,_=parse_wheel_filename(p.name);resolved[str(name)]=(str(version),sha(p))
requirements=''.join(f'{n}=={v} --hash=sha256:{s}\n' for n,(v,s) in sorted(resolved.items()))
(wheels/'requirements.hashed.txt').write_text(requirements)
shutil.copy(wheels/'requirements.hashed.txt',bundle/'requirements.hashed.txt')
lock={}
for key,tag in [('mongo','mongo:7.0.16'),('nginx','nginx:1.28-alpine'),('syft','anchore/syft:v1.20.0')]:
    run('docker','pull','--platform','linux/amd64',tag)
    data=json.loads(run('docker','image','inspect',tag,capture_output=True,text=True).stdout)[0]
    lock[key]={'reference':data['RepoDigests'][0],'id':data['Id'],'platform':data['Os']+'/'+data['Architecture']}
    assert re.search(r'@sha256:[0-9a-f]{64}$',lock[key]['reference']) and lock[key]['platform']=='linux/amd64'
# Offline runtime bundle: plain Compose with no build section or bootstrap mount.
import yaml
compose=yaml.safe_load((root/'deploy/p10/compose.yml').read_text())
for key in ['mongo','nginx']:
    lock[key]['offline_tag']='apollo-p104-'+key+':'+lock[key]['id'].split(':')[1]
    run('docker','tag',lock[key]['reference'],lock[key]['offline_tag'])
    run('docker','save','-o',str(bundle/(key+'.docker.tar')),lock[key]['offline_tag'])
compose['services']['p10-mongo']['image']=lock['mongo']['offline_tag']
compose['services']['proxy']['image']=lock['nginx']['offline_tag']
for service in compose['services'].values():
    service['pull_policy']='never'
    service['logging']={'driver':'json-file','options':{'max-size':'10m','max-file':'3'}}
web=compose['services']['web'];web.pop('build');web['image']='${P104_WEB_IMAGE:?Use verified package image}'
web['environment']['APOLLO_BOOTSTRAP_TOKEN_FILE']=''
web['volumes']=[v for v in web['volumes'] if '/bootstrap_token:' not in v]
recovery=json.loads(json.dumps(web));recovery.pop('ports');recovery.pop('healthcheck');recovery.pop('depends_on')
recovery['profiles']=['recovery'];recovery['networks']={'private':{}}
recovery['entrypoint']=['python','tools/p104_recovery.py'];recovery['command']=['inspect-target']
recovery['environment']['APOLLO_RECOVERY_ACK']='${APOLLO_RECOVERY_ACK:?Explicit synthetic recovery acknowledgement}'
recovery['volumes']+=['${P104_RECOVERY_DIR:?Private recovery directory}:/recovery:rw']
compose['services']['recovery']=recovery
# Rebase every relative static file into the self-contained package directory.
for service in compose['services'].values():
    service['volumes']=[v.replace('../homologation/start-mongo.sh','./start-mongo.sh') for v in service.get('volumes',[])]
(bundle/'compose.yml').write_text(yaml.safe_dump(compose,sort_keys=False))
for name in ['homologation.env.example','mongo-init.js','replica-init.js','nginx.conf','generate_secrets.py','apache-virtualmin.conf.example']:
    shutil.copy(root/'deploy/p10'/name,bundle/name)
shutil.copy(root/'deploy/homologation/start-mongo.sh',bundle/'start-mongo.sh')
(bundle/'images.lock.json').write_text(json.dumps(lock,indent=2)+'\n')
# Two no-cache builds. Reproducibility gate is the OCI image manifest digest, not tar ordering.
metadata=[]
for n in (1,2):
    target=bundle/'apollo-web.oci.tar' if n==1 else out/'rebuild.oci.tar'
    meta=out/f'build-{n}.json'
    run('docker','buildx','build','--no-cache','--platform','linux/amd64','--provenance=false','--sbom=false',
        '--build-arg','SOURCE_DATE_EPOCH='+epoch,'--metadata-file',str(meta),
        '--output',f'type=oci,dest={target},name=apollo-p104-web:{head},rewrite-timestamp=true',str(context))
    metadata.append(json.loads(meta.read_text()))
assert metadata[0]['containerimage.digest']==metadata[1]['containerimage.digest'],'Independent no-cache image manifests differ'
image='apollo-p104-web:'+head
run('skopeo','copy','oci-archive:'+str(bundle/'apollo-web.oci.tar'),'docker-archive:'+str(bundle/'apollo-web.docker.tar')+':'+image)
run('docker','load','-i',str(bundle/'apollo-web.docker.tar'))
info=json.loads(run('docker','image','inspect',image,capture_output=True,text=True).stdout)[0]
assert info['Config']['User']=='10001:10001' and info['Architecture']=='amd64'
# Scan complete exported runtime files for forbidden secret files and high-confidence key/token patterns.
cid=run('docker','create',image,capture_output=True,text=True).stdout.strip()
public_vectors=[]
fixture_info=json.loads((root/'deploy/p10/package/public-selftest-fixtures.json').read_text())
basecid=run('docker','create','python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df',capture_output=True,text=True).stdout.strip()
try:
    filesystem=out/'filesystem.tar';run('docker','export','-o',str(filesystem),cid)
    with tarfile.open(filesystem) as tar:
        for member in tar:
            if not member.isfile():continue
            name=Path(member.name).name
            assert name not in ('.env','id_rsa','id_ed25519','credentials.json','replica.key','mongo_uri','bootstrap_token')
            if member.size<8*1024*1024:
                raw=tar.extractfile(member).read()
                from p104_secret_scan import unsafe_content
                if unsafe_content(raw):
                    from p104_secret_scan import public_vectors_only
                    basefile=out/'base-candidate.bin'
                    run('docker','cp',basecid+':/'+member.name,str(basefile))
                    assert public_vectors_only(raw,basefile.read_bytes(),member.name,set(fixture_info['public_fixture_sha256'])),member.name
                    public_vectors.append({'path':member.name,'file_sha256':hashlib.sha256(raw).hexdigest(),'classification':'Exact public upstream self-test vectors and byte-identical pinned base library'})
finally:
    run('docker','rm',cid);run('docker','rm',basecid)
# SBOM from the retained OCI, with OS/Python packages. Add locked frontend build/bundle inventory separately.
run('docker','run','--rm','--network','none','-v',str(bundle)+':/data:ro',lock['syft']['reference'],
    'oci-archive:/data/apollo-web.oci.tar','-o','cyclonedx-json',stdout=(bundle/'sbom.cdx.json').open('w'))
sbom=json.loads((bundle/'sbom.cdx.json').read_text());assert sbom.get('bomFormat')=='CycloneDX' and sbom.get('components')
frontend=json.loads((root/'frontend/package-lock.json').read_text())
(bundle/'frontend-lock.json').write_text(json.dumps(frontend,indent=2)+'\n')
shutil.copy(root/'backend/tools/p104_verify.py',bundle/'verify_package.py')
shutil.copy(root/'deploy/p10/package/public-selftest-fixtures.json',bundle/'public-selftest-fixtures.json')
# Source and resolved dependency manifests are retained as build inputs, never secret material.
manifest={'source_head':head,'approved_app_head':'526dd72b78d57b7799fc995af42e0fe925c04379','source_date_epoch':int(epoch),
 'oci_manifest_digest':metadata[0]['containerimage.digest'],'docker_image_id':info['Id'],'image':image,
 'reproducibility':{'no_cache_builds':2,'equal_oci_manifest_digest':True,'tar_byte_identity_claimed':False},
 'runtime_secret_scan':'PASS: forbidden paths and high-confidence private key/GitHub token signatures; not a universal secret detector',
 'classified_public_base_selftests':public_vectors,'sbom_components':len(sbom['components']),'registry_pushed':False,'production_approved':False,
 'files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in bundle.iterdir() if p.is_file()}}
(bundle/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'package_prepared':True,'oci_manifest_digest':manifest['oci_manifest_digest'],'source':head}),flush=True)
