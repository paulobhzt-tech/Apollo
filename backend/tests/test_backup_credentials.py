"""Exports must not include credential hashes (synthetic values only)."""
import copy
from types import SimpleNamespace
import pytest
from routers import config

@pytest.mark.asyncio
async def test_backup_excludes_employee_credential_hashes(monkeypatch):
    from lib import backups
    async def transaction(callback, **kw):
        return await callback(object())
    monkeypatch.setattr(backups,"run_transaction",transaction)
    employee = {"id":"synthetic","name":"Synthetic","pin_hash":"synthetic-pin-hash",
                "password_hash":"synthetic-password-hash","role":"admin"}
    class Cursor:
        def __init__(self, rows):
            self.rows = rows
        async def to_list(self, limit):
            return self.rows
    class Store:
        client = object()
        def __getitem__(self, name):
            def find(query, projection, **kw):
                rows = [copy.deepcopy(employee)] if name == 'employees' else []
                for row in rows:
                    for field, include in (projection or {}).items():
                        if not include:
                            row.pop(field, None)
                return Cursor(rows)
            return SimpleNamespace(find=find)
    monkeypatch.setattr(config, 'db', Store())
    _, payload = await config.build_backup()
    exported = payload['data']['employees'][0]
    assert exported['id'] == 'synthetic'
    assert exported['name'] == 'Synthetic'
    assert 'pin_hash' not in exported
    assert 'password_hash' not in exported
    assert 'sessions' not in payload['data']

@pytest.mark.asyncio
async def test_restore_preserves_local_credentials_and_ignores_imported_hashes(monkeypatch):
    from lib.backups import restore_employee
    existing = {'id':'existing','pin_hash':'local-pin','password_hash':'local-password'}
    restored = {d['id']:restore_employee(d,existing if d['id']=='existing' else None) for d in [
        {'id':'existing','active':True,'pin_hash':'imported-pin','password_hash':'imported-password'},
        {'id':'new','active':True,'pin_hash':'imported-pin','password_hash':'imported-password'}]}
    assert restored['existing']['pin_hash'] == 'local-pin'
    assert restored['existing']['password_hash'] == 'local-password'
    assert restored['new']['active'] is False
    assert 'pin_hash' not in restored['new']
    assert 'password_hash' not in restored['new']
