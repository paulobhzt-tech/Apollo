#!/usr/bin/env python3
"""Read-only homologation audit. Never stops/starts containers or writes MongoDB."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

APP = 'apollo-homologacao-apollo-1'
MONGO = 'apollo-homologacao-mongo-1'
PRODUCTION = ('apollo-pdv-apollo-1', 'apollo-pdv-mongo-1')
BASE = Path('/opt/apollo-homologacao/deploy/homologacao')
FILES = (
    Path('/root/apollo-preparar-rs0.sh'), Path('/root/apollo-verificar-502.sh'),
    Path('/root/apollo-backups/migracao-rs0-20261117-122826/compose.yaml.original'),
    Path('/root/apollo-backups/migracao-rs0-20261117-122826/env.original'),
    BASE / 'compose.yaml', BASE / '.env',
)
BACKUP = Path('/root/apollo-backups/rs0-backup-20261117-123243/homologacao-pre-rs0.archive.gz')
EXPECTED = 'ebbb6988098a5d910bfe65503ba84fd5d7e18ea2b7df7c1da13a844246c4c2cb'


def capture(args):
    return subprocess.run(args, check=True, capture_output=True, timeout=60).stdout.decode().strip()


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def emit(kind, **value):
    print(json.dumps(dict(kind=kind, **value), sort_keys=True), flush=True)


def inspect(name):
    c = json.loads(capture(['docker', 'inspect', name]))[0]
    s, h = c['State'], c['HostConfig']
    # Never return .Config.Env, raw labels, entrypoint, commands or bind source paths.
    return dict(name=name, id=c['Id'], image_id=c['Image'], running=s.get('Running'),
                started=s.get('StartedAt'), restarts=c.get('RestartCount'), oom=s.get('OOMKilled'),
                health=s.get('Health', {}).get('Status'), memory=h.get('Memory'),
                nano_cpus=h.get('NanoCpus'), restart=h.get('RestartPolicy', {}).get('Name'),
                mount_targets=[dict(type=m['Type'], name=m.get('Name'), target=m['Destination']) for m in c['Mounts']],
                mongo_port_published=bool((c.get('NetworkSettings', {}).get('Ports') or {}).get('27017/tcp')),
                network_modes=sorted(c.get('NetworkSettings', {}).get('Networks', {})),
                compose_project=(c['Config'].get('Labels') or {}).get('com.docker.compose.project'))


MONGO_AUDIT = r'''
const c=new Mongo('mongodb://127.0.0.1:27017/?directConnection=true');
const a=c.getDB('admin');
if(!a.auth(process.env.MONGO_INITDB_ROOT_USERNAME,process.env.MONGO_INITDB_ROOT_PASSWORD)) quit(7);
const hello=a.runCommand({hello:1});
const conn=a.runCommand({connectionStatus:1,showPrivileges:true});
const opts=a.runCommand({getCmdLineOpts:1});
const result={authenticated:conn.authInfo.authenticatedUsers.length>0,
  canReplSetConfigure:(conn.authInfo.authenticatedUserPrivileges||[]).some(x=>x.actions.includes('replSetConfigure')||x.actions.includes('anyAction')),
  rootRole:(conn.authInfo.authenticatedUserRoles||[]).some(x=>x.role==='root'&&x.db==='admin'),
  version:c.getDB('admin').version(),replica_set:hello.setName||null,primary:hello.isWritablePrimary,
  configured_replset:opts.parsed?.replication?.replSetName||null,databases:[]};
for(const x of a.runCommand({listDatabases:1,nameOnly:true}).databases){
 const d=c.getDB(x.name);const st=d.runCommand({dbStats:1,scale:1,freeStorage:0});
 const entry={name:x.name,collections:st.collections,documents:st.objects,data_bytes:st.dataSize,
 storage_bytes:st.storageSize,index_bytes:st.indexSize,indexes:st.indexes};
 if(x.name===process.env.APOLLO_AUDIT_DB){
  entry.inventory=[];
  for(const i of d.getCollectionInfos()){
   if(i.type==='view'){entry.inventory.push({name:i.name,type:'view'});continue;}
   const col=d.getCollection(i.name);
   entry.inventory.push({name:i.name,type:i.type,documents:col.countDocuments({},{maxTimeMS:5000}),
    indexes:col.getIndexes().map(z=>({key:z.key,unique:!!z.unique,sparse:!!z.sparse,ttl:z.expireAfterSeconds??null,
      private_options_sha256:require('crypto').createHash('sha256').update(EJSON.stringify(z)).digest('hex')}))});
  }
 }
 result.databases.push(entry);
}
const users=a.runCommand({usersInfo:{forAllDBs:true},showCredentials:false,showPrivileges:false});
result.admin_users=users.ok?users.users.map(x=>({identity_sha256:require('crypto').createHash('sha256').update(x.user+'@'+x.db).digest('hex'),roles:x.roles})):null;
const ops=a.runCommand({currentOp:1,active:true});
result.writer_sample=ops.ok?{active_operations:ops.inprog.length,possible_writers:ops.inprog.filter(x=>['insert','update','remove'].includes(x.op)||x.command&&['insert','update','delete','findAndModify','bulkWrite'].some(k=>k in x.command)).length}:null;
result.writers_fully_inventoried=false;
print(JSON.stringify(result));
'''


def backup_summary(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('regular backup required')
    uncompressed = 0
    # Validate without extraction, writes, mongorestore, or a second Mongo process.
    with gzip.open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            uncompressed += len(chunk)
    return dict(bytes=path.stat().st_size, gzip=True, uncompressed_bytes=uncompressed,
                sha256=sha256(path))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-backup', action='store_true', help='read known backup with GZIP and SHA; does not restore')
    args=parser.parse_args()
    start=time.monotonic()
    before={n:inspect(n) for n in PRODUCTION}
    for n in PRODUCTION:
        emit('production_before', **before[n])
    for p in FILES:
        if p.is_file() and not p.is_symlink():
            st=p.stat()
            emit('file_metadata', path=str(p), bytes=st.st_size, mode=oct(st.st_mode & 0o777), uid=st.st_uid, sha256=sha256(p))
        else:
            emit('file_metadata', path=str(p), available=False)
    mongo=inspect(MONGO); app=inspect(APP)
    emit('homologation_mongo', **mongo);emit('homologation_app', **app)
    data_mount=[m for m in mongo['mount_targets'] if m['target']=='/data/db']
    if len(data_mount)!=1 or data_mount[0]['type']!='volume' or data_mount[0]['name']!='apollo-homologacao_mongo_homologacao_data':
        raise ValueError('unexpected data mount; no distinct-volume claim possible')
    prod_volumes={m['name'] for p in before.values() for m in p['mount_targets'] if m.get('name')}
    target_volumes={m['name'] for m in mongo['mount_targets'] if m.get('name')}
    if not target_volumes or prod_volumes & target_volumes:
        raise ValueError('volumes are missing or shared')
    if mongo['compose_project']!='apollo-homologacao' or app['compose_project']!='apollo-homologacao':
        raise ValueError('unexpected project')
    db=capture(['docker','exec',APP,'sh','-c','printf "%s" "$DB_NAME"'])
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}',db) or db in ('admin','local','config'):
        raise ValueError('invalid application database')
    profile = 'import os,json;from urllib.parse import urlsplit,parse_qs;u=urlsplit(os.environ.get("MONGO_URL",""));print(json.dumps({"APOLLO_ENV":os.environ.get("APOLLO_ENV"),"mongo_host":u.hostname,"replica_set":parse_qs(u.query).get("replicaSet"),"app_host":urlsplit(os.environ.get("APP_URL","")).hostname,"synthetic_mode":os.environ.get("APOLLO_DEMO_MODE")=="true"}))'
    emit('application_profile', **json.loads(capture(['docker','exec',APP,'python','-c',profile])))
    emit('database_audit', **json.loads(capture(['docker','exec','-e','APOLLO_AUDIT_DB='+db,MONGO,'mongosh','--nodb','--quiet','--eval',MONGO_AUDIT])))
    emit('mongo_data_disk', summary=capture(['docker','exec',MONGO,'du','-sk','/data/db']).split()[0]+' KiB')
    journal=capture(['docker','exec',MONGO,'sh','-c','if [ -d /data/db/journal ]; then du -sk /data/db/journal; fi'])
    emit('mongo_journal_disk', kib=journal.split()[0] if journal else None)
    emit('tools',dump_config_supported='--config' in capture(['docker','exec',MONGO,'mongodump','--help']))
    if args.verify_backup:
        summary=backup_summary(BACKUP)
        emit('backup_file', **summary, matches_owner_report=summary['sha256']==EXPECTED, restored=False)
        if summary['sha256'] != EXPECTED:
            raise ValueError('backup does not match owner-reported reference')
    for p in ('cpu','memory','io'):
        pressure=Path('/proc/pressure')/p
        if pressure.is_file():emit('pressure',resource=p,value=pressure.read_text().strip())
    emit('resources',memory=capture(['free','-h']),disk=capture(['df','-Pk',str(BASE)]),sample=capture(['vmstat','1','5']))
    for n in PRODUCTION:
        after=inspect(n)
        emit('production_after', **after, unchanged=before[n]==after)
    emit('complete',elapsed_seconds=round(time.monotonic()-start,3),mutations_executed=False,
         writers_proven_quiesced=False,restore_proven=False,rollback_proven=False)


if __name__=='__main__':
    try: main()
    except Exception:
        print('PREFLIGHT_INCOMPLETE: no mutation requested; review prerequisites locally without exposing secrets',file=sys.stderr)
        sys.exit(1)
