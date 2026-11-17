#!/usr/bin/env python3
"""Build a PRIVATE Compose URI override; never edits .env or prints connection data."""
import argparse
import json
import os
from pathlib import Path
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def rs0_uri(uri):
    p = urlsplit(uri)
    if (p.scheme != 'mongodb' or p.hostname != 'mongo' or (p.port or 27017) != 27017
            or ',' in p.netloc or p.fragment or p.path not in ('/apollo_homologacao', '/', '')
            or not p.username or not p.password):
        raise ValueError('Unexpected homologation connection')
    pairs = parse_qsl(p.query, keep_blank_values=True)
    options = dict(pairs)
    allowed = {'authSource','replicaSet','directConnection','retryWrites','w','readPreference',
               'serverSelectionTimeoutMS','connectTimeoutMS','socketTimeoutMS'}
    if len(options) != len(pairs) or set(options) - allowed:
        raise ValueError('Unexpected or duplicate connection option')
    if options.get('authSource', 'admin') != 'admin' or options.get('replicaSet', 'rs0') != 'rs0':
        raise ValueError('Unexpected auth source or replica set')
    options.pop('directConnection', None)  # App and advertised member share Docker DNS.
    options['authSource'] = 'admin'
    options['replicaSet'] = 'rs0'
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(options), ''))


def private_override(config, output):
    services = config['services']
    app = services['apollo']
    if app['environment'].get('DB_NAME') != 'apollo_homologacao':
        raise ValueError('Unexpected application database')
    if config.get('name') != 'apollo-homologacao':
        raise ValueError('Unexpected project')
    if app['environment'].get('APOLLO_ENV') == 'homologation':
        raise ValueError('P10 profile requires p10 topology; rs0 needs separate review')
    uri = rs0_uri(app['environment']['MONGO_URL'])
    result = {'services': {'apollo': {'environment': {'MONGO_URL': uri}}}}
    output = Path(output)
    parent = output.parent.stat()
    if not output.is_absolute() or parent.st_uid != os.geteuid() or parent.st_mode & 0o077:
        raise ValueError('Private operator-owned output directory required')
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(result, stream)
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    private_override(json.load(sys.stdin), args.output)
    print('PRIVATE_URI_OVERRIDE_PREPARED; no .env modified; not deployed')


if __name__ == '__main__':
    try: main()
    except Exception:
        print('URI_PREPARATION_REFUSED; inspect prerequisites locally without printing secrets', file=sys.stderr)
        sys.exit(1)
