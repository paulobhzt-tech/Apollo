"""Read-only offline bundle verification. Does not load/start/pull any image."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path


def verify(directory, loaded=False):
    directory=Path(directory)
    manifest=json.loads((directory/'manifest.json').read_text())
    for name,info in manifest['files'].items():
        if Path(name).name != name or name in ('.','..'):
            raise ValueError('Unsafe manifest path')
        file=directory/name
        if file.is_symlink() or not file.is_file():
            raise ValueError('Regular package file required')
        if not re.fullmatch('[0-9a-f]{64}',info['sha256']):
            raise ValueError('Invalid manifest hash')
        with file.open('rb') as stream:
            actual=hashlib.file_digest(stream,'sha256').hexdigest()
        if actual!=info['sha256'] or file.stat().st_size!=info['bytes']:
            raise ValueError('Package integrity mismatch: '+name)
    if loaded:
        lock=json.loads((directory/'images.lock.json').read_text())
        images=[(manifest['image'],manifest['docker_image_id'])]+[(lock[k]['offline_tag'],lock[k]['id']) for k in ['mongo','nginx']]
        for name,expected in images:
            result=subprocess.run(['docker','image','inspect','--format','{{.Id}}',name],check=True,capture_output=True,text=True)
            if result.stdout.strip()!=expected:
                raise ValueError('Loaded image identity mismatch')
    return {'verified_files':len(manifest['files']),'loaded_images_verified':loaded,'writes':False}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');p.add_argument('--loaded-images',action='store_true');a=p.parse_args()
    print(json.dumps(verify(a.directory,a.loaded_images)))
