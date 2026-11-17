#!/usr/bin/env python3
"""Fail-closed backup tools. No automatic retention deletion or live restore."""
import contextlib
import datetime
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

class Refused(Exception):
    pass

def require(value, message):
    if not value:
        raise Refused(message)

def setting(name, pattern):
    value = os.environ.get(name, '')
    require(re.fullmatch(pattern, value), 'Configuracao invalida: ' + name)
    return value

def run(args, **kwargs):
    # Tool stderr may contain connection details; never forward it to terminal/CI.
    return subprocess.run(args, check=True, timeout=1800, stderr=subprocess.DEVNULL, **kwargs)

def capture(args):
    return run(args, stdout=subprocess.PIPE).stdout.decode().strip()

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def validate_archive(path):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size > 0, 'Arquivo invalido')
    with gzip.open(path, 'rb') as stream:
        while stream.read(1024 * 1024):
            pass

def verify(bundle):
    require(bundle.is_dir() and not bundle.is_symlink(), 'Bundle invalido')
    require({p.name for p in bundle.iterdir()} == {'dump.archive.gz', 'manifest.json'}, 'Bundle contem arquivos inesperados')
    require(not (bundle / 'manifest.json').is_symlink(), 'Manifesto symlink proibido')
    archive = bundle / 'dump.archive.gz'
    manifest = json.loads((bundle / 'manifest.json').read_text())
    require(manifest.get('format') == 1, 'Manifesto invalido')
    require(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,62}', manifest.get('database', '')), 'Banco invalido')
    require(manifest.get('environment') in ('producao', 'homologacao'), 'Ambiente invalido')
    require(manifest.get('consistency') == 'writes-quiesced', 'Consistencia ausente')
    validate_archive(archive)
    require(digest(archive) == manifest['sha256'], 'SHA-256 divergente')
    require(archive.stat().st_size == manifest['bytes'], 'Tamanho divergente')
    require(bool(manifest.get('counts')), 'Inventario vazio')
    return manifest

# Authentication lives only in the container process and a private temporary config.
# JSON is a YAML subset supported by Database Tools --config.
AUTH = r'''
set -eu
umask 077
cfg=$(mktemp /tmp/apollo-dump.XXXXXXXX)
trap 'rm -f "$cfg"' EXIT HUP INT TERM
export APOLLO_DUMP_CONFIG="$cfg"
mongosh --nodb --quiet --eval 'require("fs").writeFileSync(process.env.APOLLO_DUMP_CONFIG, JSON.stringify({password:process.env.MONGO_INITDB_ROOT_PASSWORD}))' >/dev/null
mongodump --config "$cfg" --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --db "$1" --archive --gzip
'''
STATS = r'''
const c = new Mongo('mongodb://127.0.0.1:27017');
if (!c.getDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) quit(9);
const d = c.getDB(process.env.APOLLO_BACKUP_DB);
const out = {};
for (const n of d.getCollectionNames().sort()) { out[n] = d.getCollection(n).countDocuments({}); }
print(JSON.stringify(out));
'''

def stats(container, database):
    value = json.loads(capture(['docker', 'exec', '-e', 'APOLLO_BACKUP_DB=' + database,
                               container, 'mongosh', '--nodb', '--quiet', '--eval', STATS]))
    require(isinstance(value, dict) and value and all(isinstance(v, int) and v >= 0 for v in value.values()), 'Banco vazio ou contagens invalidas')
    return value

@contextlib.contextmanager
def exclusive(root):
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), 'Diretorio privado deve existir')
    st = root.stat()
    require(st.st_uid == os.geteuid() and st.st_mode & 0o077 == 0, 'Diretorio deve pertencer ao operador e ter modo 0700')
    fd = os.open(root / '.backup.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)

def backup():
    env = setting('APOLLO_ENV', r'producao|homologacao')
    database = setting('APOLLO_DB', r'[A-Za-z][A-Za-z0-9_]{0,62}')
    require(database not in ('admin', 'local', 'config'), 'Banco de sistema proibido')
    require(os.environ.get('APOLLO_EXPECTED_DB') == database, 'Confirme banco observado na aplicacao')
    container = setting('APOLLO_MONGO_CONTAINER', r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}')
    app = setting('APOLLO_APP_CONTAINER', r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}')
    require(container != app, 'Containers devem ser distintos')
    require(os.environ.get('APOLLO_WRITES_QUIESCED') == 'YES', 'Exige janela sem gravacoes de todos os clientes')
    root = Path(os.environ.get('APOLLO_BACKUP_ROOT', ''))
    require(root.name == env, 'Diretorio final deve identificar o ambiente')
    with exclusive(root):
        # Require both containers to belong to the same explicitly selected compose project.
        project = setting('APOLLO_COMPOSE_PROJECT', r'[a-z0-9][a-z0-9_-]{0,62}')
        for name in (container, app):
            actual = capture(['docker', 'inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name])
            require(actual == project, 'Projeto Docker divergente')
        observed = capture(['docker', 'exec', app, 'sh', '-c', 'printf "%s" "$DB_NAME"'])
        require(observed == database, 'DB_NAME da aplicacao divergente')
        ips = capture(['docker', 'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}', container]).split()
        require(bool(ips), 'Mongo sem endereco privado comprovado')
        # Parse inside the app container; no URI/password crosses stdout or argv.
        probe = 'import os,socket,sys;from urllib.parse import urlsplit;u=urlsplit(os.environ["MONGO_URL"]);assert u.scheme=="mongodb" and u.hostname and "," not in u.netloc;assert (u.port or 27017)==27017;assert socket.gethostbyname(u.hostname) in sys.argv[1:];print("MATCH")'
        require(capture(['docker', 'exec', app, 'python', '-c', probe, *ips]) == 'MATCH', 'Destino MONGO_URL nao comprovado')
        require(shutil.disk_usage(root).free >= int(os.environ.get('APOLLO_MIN_FREE_BYTES', '2147483648')), 'Reserva de disco insuficiente')
        before = stats(container, database)
        stage = Path(tempfile.mkdtemp(prefix='.partial-', dir=root))
        try:
            archive = stage / 'dump.archive.gz'
            with archive.open('xb') as stream:
                run(['docker', 'exec', container, 'sh', '-c', AUTH, 'backup', database], stdout=stream)
                stream.flush()
                os.fsync(stream.fileno())
            validate_archive(archive)
            require(before == stats(container, database), 'Contagens mudaram durante backup')
            manifest = dict(format=1, environment=env, database=database, container=container,
                            project=project, counts=before, consistency='writes-quiesced',
                            sha256=digest(archive), bytes=archive.stat().st_size,
                            created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
            with (stage / 'manifest.json').open('x') as stream:
                json.dump(manifest, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            verify(stage)
            name = env + '-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex
            dest = root / name
            os.rename(stage, dest)
            fd = os.open(root, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            print('BACKUP_VERIFICADO ' + str(dest))
        finally:
            if stage.exists():
                shutil.rmtree(stage)  # Only this invocation's private temporary directory.

def restore(bundle):
    manifest = verify(bundle)
    require(os.environ.get('APOLLO_DISPOSABLE_HOST') == 'YES', 'Ensaio exige host descartavel separado da VPS')
    image = setting('APOLLO_MONGO_IMAGE', r'mongo@sha256:[a-f0-9]{64}')
    name = 'apollo-drill-' + uuid.uuid4().hex
    # No host paths, persistent volumes, network, ports, restart policy or live destination.
    run(['docker', 'run', '-d', '--pull=never', '--name', name, '--network', 'none',
         '--memory', '768m', '--memory-swap', '768m', '--cpus', '0.5', '--pids-limit', '128',
         '--tmpfs', '/data/db:rw,size=384m', '--tmpfs', '/data/configdb:rw,size=16m',
         image, '--bind_ip', '127.0.0.1', '--wiredTigerCacheSizeGB', '0.25'], stdout=subprocess.DEVNULL)
    try:
        ready = False
        for _ in range(60):
            try:
                ready = capture(['docker', 'exec', name, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1}).ok']) == '1'
            except subprocess.CalledProcessError:
                pass
            if ready:
                break
            time.sleep(1)
        require(ready, 'Mongo descartavel indisponivel')
        source = manifest['database']
        with (bundle / 'dump.archive.gz').open('rb') as stream:
            run(['docker', 'exec', '-i', name, 'mongorestore', '--archive', '--gzip',
                 '--nsInclude=' + source + '.*', '--nsFrom=' + source + '.*',
                 '--nsTo=apollo_restore_drill.*', '--stopOnError'], stdin=stream, stdout=subprocess.DEVNULL)
        js = "const d=db.getSiblingDB('apollo_restore_drill');const o={};for(const n of d.getCollectionNames().sort()){o[n]=d.getCollection(n).countDocuments({});} print(JSON.stringify(o));"
        counts = json.loads(capture(['docker', 'exec', name, 'mongosh', '--quiet', '--eval', js]))
        require(counts == manifest['counts'], 'Colecoes/contagens divergentes')
        # Stream documents to private host storage; never print documents or findings.
        # Host needs the backend's pinned pymongo/bson dependencies.
        with tempfile.TemporaryDirectory(prefix='apollo-financial-') as private:
            datafile = Path(private) / 'data.json'
            js = "const d=db.getSiblingDB('apollo_restore_drill');print('{');let first=true;for(const n of d.getCollectionNames().sort()){if(!first)print(',');first=false;print(JSON.stringify(n)+':[');let f=true;for(const x of d.getCollection(n).find()){if(!f)print(',');f=false;print(EJSON.stringify(x,{relaxed:false}));}print(']');}print('}');"
            with datafile.open('xb') as output:
                run(['docker', 'exec', name, 'mongosh', '--quiet', '--eval', js], stdout=output)
            sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
            from bson import json_util
            from lib.reconciliation import audit
            result = audit(json_util.loads(datafile.read_text()))
            require(not result.get('findings'), 'Reconciliacao requer revisao; producao bloqueada')
        print('RESTORE_COUNTS_AND_RECONCILIATION_PASS; nao libera producao')
    finally:
        run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)

def upload(bundle):
    manifest = verify(bundle)
    require(re.fullmatch(r'(producao|homologacao)-[A-Za-z0-9_-]+', bundle.name), 'Nome de bundle invalido')
    require(bundle.name.startswith(manifest['environment'] + '-'), 'Ambiente do bundle divergente')
    remote = 'apollo-criptografado:apollo/' + manifest['environment'] + '/' + bundle.name
    # rclone crypt remote must be independently checked by the operator before authorization.
    require(os.environ.get('APOLLO_CRYPT_REMOTE_VERIFIED') == 'YES', 'Remote crypt nao confirmado')
    run(['rclone', 'copy', str(bundle), remote, '--immutable', '--transfers', '1', '--checkers', '1'], stdout=subprocess.DEVNULL)
    run(['rclone', 'check', str(bundle), remote, '--download', '--one-way'], stdout=subprocess.DEVNULL)
    print('EXTERNAL_DOWNLOAD_CHECK_PASS')

def main():
    os.umask(0o077)
    require(len(sys.argv) >= 2, 'Informe backup, verify, restore ou upload')
    action = sys.argv[1]
    if action == 'backup':
        require(len(sys.argv) == 2, 'Argumentos inesperados')
        backup()
    else:
        require(len(sys.argv) == 3, 'Informe um bundle')
        bundle = Path(sys.argv[2]).resolve()
        if action == 'verify':
            verify(bundle)
            print('SHA256_GZIP_PASS; nao comprova restauracao')
        elif action == 'restore':
            restore(bundle)
        elif action == 'upload':
            upload(bundle)
        else:
            raise Refused('Acao invalida')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('FALHA: operacao recusada ou ferramenta falhou; consulte procedimento sem expor segredos', file=sys.stderr)
        sys.exit(1)
