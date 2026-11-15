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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    binary = os.environ['MONGOD_BIN']
    http = "--http" in sys.argv
    arguments = [arg for arg in sys.argv[1:] if arg != "--http"]
    backend = None
    with tempfile.TemporaryDirectory(prefix='apollo-p0-replica-') as directory:
        log = open(Path(directory)/'mongo.log', 'w')
        process = subprocess.Popen([binary, '--dbpath', directory, '--port', '27027',
            '--bind_ip', '127.0.0.1', '--replSet', 'apolloP0', '--nounixsocket',
            '--setParameter', 'enableTestCommands=1',
            '--setParameter', 'transactionLifetimeLimitSeconds=5',
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
                   'APOLLO_MONGOD_PID':str(process.pid), 'DB_NAME':'apollo_p0_test', 'APOLLO_P0_INTEGRATION':'1', 'NO_PROXY':'127.0.0.1,localhost'}
            if http:
                import bcrypt
                import httpx
                from models.schemas import Employee, Category, Product, Ingredient, CashSession
                testdb = client['apollo_p0_http_test']
                employee = Employee(id='http-admin', name='Synthetic HTTP admin', role='admin').model_dump()
                employee['pin_hash'] = bcrypt.hashpw(b'1234', bcrypt.gensalt(rounds=12)).decode()
                testdb.employees.insert_one(employee)
                testdb.categories.insert_one(Category(id='http-cat', name='Synthetic').model_dump())
                testdb.ingredients.insert_one(Ingredient(id='http-ing', name='Synthetic', unit='un', stock=1000,
                    min_stock=0, cost_per_unit=1).model_dump())
                testdb.products.insert_one(Product(id='http-product', name='Synthetic', category_id='http-cat',
                    price=10, recipe=[{'ingredient_id':'http-ing','qty':1}]).model_dump())
                testdb.cash_sessions.insert_one(CashSession(id='http-cash', opening_amount=0,
                    opened_by_name='Synthetic HTTP admin').model_dump())
                env['BACKEND_URL'] = 'http://127.0.0.1:8001'
                backend = subprocess.Popen([sys.executable,'-m','uvicorn','server:app','--host',
                    '127.0.0.1','--port','8001'], env={**env, 'DB_NAME':'apollo_p0_http_test'}, cwd=Path(__file__).resolve().parents[1], stdout=log, stderr=subprocess.STDOUT)
                env['APOLLO_BACKEND_PID']=str(backend.pid)
                with httpx.Client(trust_env=False, timeout=.5) as httpclient:
                    for _ in range(100):
                        if backend.poll() is not None:
                            raise RuntimeError(Path(directory,'mongo.log').read_text()[-4000:])
                        try:
                            if httpclient.get(env['BACKEND_URL']+'/api/').status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        time.sleep(.1)
                    else:
                        raise RuntimeError('Isolated HTTP backend did not start')
            code = subprocess.call([sys.executable,'-m','pytest','-n','0',*arguments],env=env,cwd=Path(__file__).resolve().parents[1])
            client.close()
            return code
        finally:
            if backend is not None:
                backend.terminate()
                try:
                    backend.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    backend.kill()
                    backend.wait()
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            log.close()

if __name__ == '__main__':
    sys.exit(main())
