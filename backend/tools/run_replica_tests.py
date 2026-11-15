"""Run tests with a disposable loopback-only MongoDB replica set.

MONGOD_BIN must point to an already-installed mongod. No downloads, production
configuration changes or persistent database paths. Everything is owned by this
process, including child cleanup. Run from backend.
"""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from pymongo import MongoClient


def main():
    binary = os.environ['MONGOD_BIN']
    with tempfile.TemporaryDirectory(prefix='apollo-p0-replica-') as directory:
        log = open(Path(directory)/'mongo.log', 'w')
        process = subprocess.Popen([binary, '--dbpath', directory, '--port', '27027',
            '--bind_ip', '127.0.0.1', '--replSet', 'apolloP0', '--nounixsocket',
            '--setParameter', 'enableTestCommands=1',
            '--setParameter', 'diagnosticDataCollectionEnabled=false',
            '--wiredTigerCacheSizeGB', '0.25'], stdout=log, stderr=subprocess.STDOUT)
        try:
            client = MongoClient('mongodb://127.0.0.1:27027', directConnection=True,
                                 serverSelectionTimeoutMS=500, connectTimeoutMS=500)
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError(Path(directory,'mongo.log').read_text()[-4000:])
                try:
                    client.admin.command('ping')
                    break
                except Exception:
                    time.sleep(.1)
            else:
                raise RuntimeError('MongoDB did not start')
            client.admin.command('replSetInitiate', {'_id':'apolloP0',
                'members':[{'_id':0,'host':'127.0.0.1:27027'}]})
            for _ in range(100):
                if client.admin.command('hello').get('isWritablePrimary'):
                    break
                time.sleep(.1)
            else:
                raise RuntimeError('Replica set did not elect primary')
            print('REAL MongoDB', client.server_info()['version'], 'replica set apolloP0 PRIMARY', flush=True)
            env = {**os.environ, 'MONGO_URL':'mongodb://127.0.0.1:27027/?replicaSet=apolloP0',
                   'DB_NAME':'apollo_p0_test', 'APOLLO_P0_INTEGRATION':'1', 'NO_PROXY':'127.0.0.1,localhost'}
            code = subprocess.call([sys.executable,'-m','pytest','-n','0',*sys.argv[1:]],env=env)
            client.close()
            return code
        finally:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            log.close()

if __name__ == '__main__':
    sys.exit(main())
