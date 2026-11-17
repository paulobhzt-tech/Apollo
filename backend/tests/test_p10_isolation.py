import socket
import pytest
from pydantic import ValidationError
from lib.homologation import validate, install_egress_guard
from lib.bootstrap import check_bootstrap_token
from models.schemas import LoginIn, EmployeeIn, PublicOrderStatus
from fastapi import HTTPException


def config():
    return {'APOLLO_ENV': 'homologation', 'APOLLO_DEMO_MODE': 'true','APOLLO_P10_DISPOSABLE_RUNNER':'1',
        'APOLLO_HOMOLOGATION_ACK': 'SYNTHETIC_ONLY_NO_REAL_DATA',
        'APOLLO_EXTERNAL_INTEGRATIONS': 'disabled', 'COOKIE_SECURE': 'true',
        'DB_NAME': 'apollo_p10_test_unit', 'MONGO_URL': 'mongodb://127.0.0.1:27030/?replicaSet=p10',
        'APP_URL': 'https://127.0.0.1:8444', 'CORS_ORIGINS': ''}


@pytest.mark.parametrize('key,value', [
    ('APOLLO_DEMO_MODE', 'false'), ('APOLLO_HOMOLOGATION_ACK', ''),
    ('APOLLO_EXTERNAL_INTEGRATIONS', 'enabled'), ('COOKIE_SECURE', 'false'),
    ('DB_NAME', 'production'), ('MONGO_URL', 'mongodb+srv://production.example/test'),
    ('MONGO_URL', 'mongodb://production:27017/?replicaSet=p10'),
    ('MONGO_URL', 'mongodb://127.0.0.1:27030/production?replicaSet=p10'),
    ('MONGO_URL', 'mongodb://root:production-secret@127.0.0.1:27030/?replicaSet=p10'),
    ('MONGO_URL', 'mongodb://127.0.0.1:27030/'),
    ('MONGO_URL', 'mongodb://127.0.0.1:27030/?replicaSet=p10&proxyHost=external.invalid'),
    ('MONGO_URL', 'mongodb://127.0.0.1:27030/?replicaSet=p10&authSource=admin'),
    ('APOLLO_P10_DISPOSABLE_RUNNER', '0'),
    ('APP_URL', 'http://homolog.apollo-pdv.com'), ('CORS_ORIGINS', '*'),
    ('GOOGLE_CLIENT_SECRET', 'SyntheticSecretNeverEcho-P10'), ('WEBHOOK_CRON_SECRET', 'SyntheticSecretNeverEcho-P10'),
    ('PRODUCTION_DATABASE', 'SyntheticSecretNeverEcho-P10'),
])
def test_unsafe_settings_fail_before_database_connection(key, value):
    cfg = {**config(), key: value}
    with pytest.raises(RuntimeError) as error:
        validate(cfg)
    if key == 'MONGO_URL' or 'SECRET' in key or 'PRODUCTION' in key:
        assert value not in str(error.value)


def test_exact_test_configuration_and_legacy_mode():
    assert validate(config())['database'] == 'apollo_p10_test_unit'
    assert validate({}) is None


def test_egress_guard_blocks_tcp_clients_before_external_io(monkeypatch):
    with monkeypatch.context() as patch:
        patch.setattr(socket.socket, 'connect', socket.socket.connect)
        patch.setattr(socket.socket, 'connect_ex', socket.socket.connect_ex)
        install_egress_guard(validate(config()))
        with socket.socket() as sock:
            for address in [('203.0.113.1', 443), ('127.0.0.1', 25), ('127.0.0.1', 8000)]:
                with pytest.raises(PermissionError): sock.connect(address)
                with pytest.raises(PermissionError): sock.connect_ex(address)


def test_bootstrap_disabled_unless_protected_strong_secret_mounted(tmp_path, monkeypatch):
    monkeypatch.delenv('APOLLO_BOOTSTRAP_TOKEN_FILE', raising=False)
    with pytest.raises(HTTPException) as error: check_bootstrap_token('admin')
    assert error.value.status_code == 404
    path = tmp_path/'bootstrap'; path.write_text('a'*48); path.chmod(0o644)
    monkeypatch.setenv('APOLLO_BOOTSTRAP_TOKEN_FILE', str(path))
    with pytest.raises(HTTPException) as error: check_bootstrap_token('a'*48)
    assert error.value.status_code == 503
    path.chmod(0o600)
    with pytest.raises(HTTPException) as error: check_bootstrap_token('wrong')
    assert error.value.status_code == 403
    check_bootstrap_token('a'*48)


@pytest.mark.parametrize('password', ['a'*73, 'ç'*37])
def test_passwords_cannot_silently_alias_bcrypt_prefix(password):
    with pytest.raises(ValidationError): LoginIn(username='ficticio', password=password)
    with pytest.raises(ValidationError): EmployeeIn(name='Fictício', role='caixa', pin='739251', username='ficticio', password=password)


def test_public_delivery_dto_removes_cost_recipe_and_customer():
    result = PublicOrderStatus.model_validate({'id':'synthetic', 'number':1, 'delivery_status':'pendente',
        'total':10, 'created_at':'2026-11-16T00:00:00Z', 'customer':{'cpf':'secret'},
        'items':[{'id':'item','name':'Fictício','qty':1,'unit_price':10,
                  'unit_cost':2, 'stock_recipe':[{'ingredient_id':'secret','qty':1}]}]})
    text = result.model_dump_json()
    assert 'unit_cost' not in text and 'stock_recipe' not in text and 'secret' not in text
