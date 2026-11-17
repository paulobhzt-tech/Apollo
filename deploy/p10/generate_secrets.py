"""Generate NEW synthetic-only secrets. Never overwrites files or prints values."""
import argparse, os, secrets, base64
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('--container-owners',action='store_true');args=p.parse_args()
args.directory.mkdir(mode=0o700,parents=True,exist_ok=False)
password=secrets.token_urlsafe(36)
values={'mongo_password':password,'root_password':secrets.token_urlsafe(36),
 'replica.key':base64.b64encode(secrets.token_bytes(512)).decode(),'bootstrap_token':secrets.token_urlsafe(48),
 'mongo_uri':f'mongodb://p10_homolog:{password}@p10-mongo:27017/apollo_p10_homolog?replicaSet=p10&authSource=apollo_p10_homolog'}
for name,value in values.items():
    file=args.directory/name;file.write_text(value+'\n');file.chmod(0o400)
    if args.container_owners:
        uid=10001 if name in ('bootstrap_token','mongo_uri') else 999
        os.chown(file,uid,uid)
print('New P10 secrets generated; values omitted. Never reuse production credentials.')
