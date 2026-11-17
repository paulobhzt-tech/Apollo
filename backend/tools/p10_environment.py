"""P10 operator commands; secrets never printed or passed as CLI arguments."""
import os
import sys
import json
import getpass
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

def environment():
    if os.environ.get('APOLLO_ENV') != 'homologation':
        raise RuntimeError('P10 container requires homologation mode')
    if 'MONGO_URL' not in os.environ:
        os.environ['MONGO_URL'] = Path(os.environ['MONGO_URL_FILE']).read_text().strip()
    from lib.homologation import validate
    return validate()

def initialize():
    config = environment()
    from pymongo import MongoClient
    with MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=10000) as client:
        db = client[config['database']]
        from urllib.parse import urlsplit
        if urlsplit(os.environ['MONGO_URL']).username:
            roles=client.admin.command('connectionStatus').get('authInfo',{}).get('authenticatedUserRoles',[])
            if roles != [{'role':'readWrite','db':config['database']}]:
                raise RuntimeError('A restricted test database role is required')
        if not client.admin.command('hello').get('isWritablePrimary'):
            raise RuntimeError('A writable replica set is required')
        marker = db.settings.find_one({'_id': 'p10-isolation'})
        if marker:
            if marker.get('synthetic') is not True or marker.get('environment') != 'homologation':
                raise RuntimeError('Invalid existing P10 marker')
            return
        if any(db[name].find_one({}) for name in db.list_collection_names()):
            raise RuntimeError('Refusing to initialize a nonempty database')
        db.settings.insert_one({'_id':'p10-isolation','synthetic':True,'environment':'homologation'})
        print('P10 synthetic database initialized')

def bootstrap():
    config = environment()
    import urllib.request
    username = input('New synthetic admin username: ')
    password = getpass.getpass('New admin password (12–72 bytes): ')
    pin = getpass.getpass('New admin PIN (6 digits): ')
    token = Path(os.environ['APOLLO_BOOTSTRAP_TOKEN_FILE']).read_text().strip()
    data = json.dumps({'username':username,'password':password,'pin':pin,'name':'Administrador fictício P10'}).encode()
    request = urllib.request.Request('http://127.0.0.1:'+os.environ.get('PORT','10000')+'/api/auth/first-access',
        data=data, headers={'Host':config['host'],'Origin':os.environ['APP_URL'],
                            'Content-Type':'application/json','X-Apollo-Bootstrap':token})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200: raise RuntimeError('Bootstrap failed')
    print('Synthetic administrator provisioned. Remove the bootstrap secret mount before exposure.')

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv)>1 else 'serve'
    if mode == 'init': initialize()
    elif mode == 'bootstrap': bootstrap()
    elif mode == 'serve':
        environment()
        os.execvp('uvicorn',['uvicorn','server:app','--host','0.0.0.0','--port',os.environ.get('PORT','10000'),
            '--proxy-headers','--forwarded-allow-ips',os.environ.get('TRUSTED_PROXY_IPS','127.0.0.1')])
    else: raise SystemExit('Unknown P10 command')
