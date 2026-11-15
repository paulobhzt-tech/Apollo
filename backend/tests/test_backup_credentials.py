"""Exports must not include credential hashes (synthetic values only)."""
import copy
from types import SimpleNamespace
import pytest
from routers import config

@pytest.mark.asyncio
async def test_backup_excludes_employee_credential_hashes(monkeypatch):
    employee = {"id":"synthetic","name":"Synthetic","pin_hash":"synthetic-pin-hash",
                "password_hash":"synthetic-password-hash","role":"admin"}
    class Cursor:
        def __init__(self, rows):
            self.rows = rows
        async def to_list(self, limit):
            return self.rows
    class Store:
        def __getitem__(self, name):
            def find(query, projection):
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
    from unittest.mock import AsyncMock
    from models.schemas import RestoreIn
    from routers import production
    existing = {'id':'existing','pin_hash':'local-pin','password_hash':'local-password'}
    class Cursor:
        async def to_list(self, limit):
            return [copy.deepcopy(existing)]
    employees = SimpleNamespace(find=lambda *a,**k: Cursor(), delete_many=AsyncMock(), replace_one=AsyncMock())
    products = SimpleNamespace(delete_many=AsyncMock(), insert_many=AsyncMock())
    orders = SimpleNamespace(find_one=AsyncMock(return_value=None))
    class Store:
        def __init__(self):
            self.employees = employees
            self.orders = orders
        def __getitem__(self, name):
            return {'employees':employees,'products':products}[name]
    monkeypatch.setattr(config,'db',Store())
    monkeypatch.setattr(production,'ensure_environments',AsyncMock())
    await config.restore(RestoreIn(data={
        'products':[{'id':'synthetic-product'}],
        'employees':[
            {'id':'existing','active':True,'pin_hash':'imported-pin','password_hash':'imported-password'},
            {'id':'new','active':True,'pin_hash':'imported-pin','password_hash':'imported-password'},
        ]}), {'id':'existing'})
    restored = {call.args[1]['id']:call.args[1] for call in employees.replace_one.await_args_list}
    assert restored['existing']['pin_hash'] == 'local-pin'
    assert restored['existing']['password_hash'] == 'local-password'
    assert restored['new']['active'] is False
    assert 'pin_hash' not in restored['new']
    assert 'password_hash' not in restored['new']
