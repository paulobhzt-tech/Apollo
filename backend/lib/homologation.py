"""Fail-closed P10 environment; no changes to financial transaction semantics."""
import ipaddress
import os
import socket
from urllib.parse import urlsplit, parse_qs

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def enabled(env=None):
    return (os.environ if env is None else env).get('APOLLO_ENV') == 'homologation'


def validate(env=None):
    cfg = os.environ if env is None else env
    if not enabled(cfg):
        return None
    required = {'APOLLO_DEMO_MODE': 'true', 'APOLLO_HOMOLOGATION_ACK': 'SYNTHETIC_ONLY_NO_REAL_DATA',
                'APOLLO_EXTERNAL_INTEGRATIONS': 'disabled', 'COOKIE_SECURE': 'true'}
    if any(cfg.get(key) != value for key, value in required.items()):
        raise RuntimeError('P10 isolation: mandatory safety settings missing')
    name = cfg.get('DB_NAME', '')
    if name != 'apollo_p10_homolog' and not name.startswith('apollo_p10_test_'):
        raise RuntimeError('P10 isolation: dedicated test database required')
    try:
        uri = urlsplit(cfg.get('MONGO_URL', ''))
        options = parse_qs(uri.query, keep_blank_values=True)
        if (uri.scheme != 'mongodb' or uri.hostname not in ('127.0.0.1', '::1', 'p10-mongo')
                or ',' in uri.netloc or uri.fragment or options.get('replicaSet') != ['p10']
                or set(options) - {'replicaSet', 'authSource'}
                or ('authSource' in options and options['authSource'] != [name])
                or uri.path not in ('', '/', '/'+name)):
            raise ValueError()
        port = uri.port or 27017
        if uri.username is not None and (uri.username != 'p10_homolog' or len(uri.password or '') < 24):
            raise ValueError()
        if uri.username is None and (uri.hostname == 'p10-mongo' or not name.startswith('apollo_p10_test_')
                or cfg.get('APOLLO_P10_DISPOSABLE_RUNNER') != '1' or port != 27030):
            raise ValueError()
        app = urlsplit(cfg.get('APP_URL', ''))
        if (app.scheme != 'https' or app.hostname not in ('homolog.apollo-pdv.com', '127.0.0.1', 'localhost')
                or app.username or app.password or app.path not in ('', '/') or app.query or app.fragment):
            raise ValueError()
        if cfg.get('CORS_ORIGINS', '') not in ('', cfg.get('APP_URL', '')):
            raise ValueError()
    except (ValueError, TypeError):
        raise RuntimeError('P10 isolation: restricted MongoDB and HTTPS origins required') from None
    denied = ('GOOGLE_', 'AWS_', 'STRIPE_', 'MERCADOPAGO_', 'PAGARME_', 'SEFAZ_', 'WEBHOOK_', 'PAYMENT_PROVIDER_')
    if any(value and (key.startswith(denied) or 'PRODUCTION' in key or key.endswith('_PROD')) for key, value in cfg.items()):
        raise RuntimeError('P10 isolation: external or production credentials forbidden')
    return {'mongo_host': uri.hostname, 'mongo_port': port, 'host': app.netloc.lower(), 'database': name}


def install_egress_guard(settings):
    """Defense in depth; the deployment also uses a Docker internal network.

    Allow only the configured Mongo endpoint. No HTTP client, webhook, SMTP,
    Google Drive or future payment/fiscal connector may connect elsewhere.
    """
    addresses = {row[4][0] for row in socket.getaddrinfo(settings['mongo_host'], settings['mongo_port'], type=socket.SOCK_STREAM)}
    if any(not ipaddress.ip_address(address).is_private for address in addresses):
        raise RuntimeError('P10 isolation: MongoDB must resolve privately')
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    def allowed(address):
        return (isinstance(address, tuple) and len(address) >= 2
                and address[0] in addresses and address[1] == settings['mongo_port'])
    def connect(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and not allowed(address):
            raise PermissionError('P10 isolation: external egress denied')
        return original_connect(sock, address)
    def connect_ex(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and not allowed(address):
            raise PermissionError('P10 isolation: external egress denied')
        return original_connect_ex(sock, address)
    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex


async def verify_database(db, client):
    if not enabled():
        return
    marker = await db.settings.find_one({'_id': 'p10-isolation', 'synthetic': True, 'environment': 'homologation'})
    hello = await client.admin.command('hello')
    if not marker or not hello.get('setName') or not hello.get('isWritablePrimary'):
        raise RuntimeError('P10 isolation: synthetic marker and writable replica set required')
    if urlsplit(os.environ['MONGO_URL']).username:
        status = await client.admin.command('connectionStatus')
        roles = status.get('authInfo', {}).get('authenticatedUserRoles', [])
        if roles != [{'role': 'readWrite', 'db': db.name}]:
            raise RuntimeError('P10 isolation: application role must be restricted to its test database')


class HomologationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not enabled():
            return await call_next(request)
        cfg = validate()
        if request.headers.get('host', '').lower() != cfg['host']:
            return JSONResponse({'detail': 'Host não autorizado'}, status_code=400)
        path = request.url.path
        if (path.startswith(('/api/drive', '/api/cron/', '/api/backup/restore'))
                or 'webhook' in path.lower()):
            return JSONResponse({'detail': 'Integração externa/importação bloqueada na homologação'}, status_code=403)
        if path.startswith('/api/public/') and request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            # Reserve atomically before processing; all attempts consume the budget.
            from lib.db import db
            from datetime import datetime, timezone, timedelta
            from pymongo import ReturnDocument
            timestamp = datetime.now(timezone.utc)
            key = f"p10-public:{request.client.host if request.client else 'unknown'}:{int(timestamp.timestamp())//60}"
            entry = await db.login_attempts.find_one_and_update({'_id': key},
                {'$inc': {'attempts': 1}, '$setOnInsert': {'expires_at': timestamp+timedelta(minutes=5)}},
                upsert=True, return_document=ReturnDocument.AFTER)
            if entry['attempts'] > 60:
                return JSONResponse({'detail': 'Limite de solicitações públicas excedido'}, status_code=429)
        response = await call_next(request)
        response.headers['X-Apollo-Environment'] = 'HOMOLOGACAO'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        if path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response
