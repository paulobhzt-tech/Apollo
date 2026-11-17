import hashlib
import json
import pytest
from tools.p104_recovery import protected_json, read_backup, connect


def test_recovery_rejects_missing_explicit_ack(monkeypatch):
    import asyncio
    monkeypatch.delenv('APOLLO_RECOVERY_ACK',raising=False)
    with pytest.raises(ValueError,match='acknowledgement'):
        asyncio.run(connect())


def test_recovery_file_permissions_and_symlinks(tmp_path):
    f=tmp_path/'backup';f.write_text('{}');f.chmod(0o644)
    with pytest.raises(ValueError,match='Private regular'):
        protected_json(f)
    f.chmod(0o600);assert protected_json(f)==b'{}'
    s=tmp_path/'link';s.symlink_to(f)
    with pytest.raises(ValueError,match='Symlinks'):
        protected_json(s)


def test_recovery_rejects_changed_bytes_before_database_connection(tmp_path):
    f=tmp_path/'backup';f.write_text('{}');f.chmod(0o600)
    with pytest.raises(ValueError,match='SHA256 mismatch'):
        read_backup(f,'0'*64)
    with pytest.raises(ValueError,match='Expected SHA256'):
        read_backup(f,'not-a-hash')


def test_recovery_rejects_corrupt_manifest(tmp_path,monkeypatch):
    import os
    monkeypatch.setenv("MONGO_URL",os.environ.get("MONGO_URL","mongodb://127.0.0.1:59999"))
    monkeypatch.setenv("DB_NAME",os.environ.get("DB_NAME","apollo_p10_test_unit"))
    from fastapi import HTTPException
    f=tmp_path/'backup';f.write_text(json.dumps({'data':{},'manifest':{},'format_version':2}));f.chmod(0o600)
    with pytest.raises(HTTPException):
        read_backup(f,hashlib.sha256(f.read_bytes()).hexdigest())


def test_secret_scan_parser_marker_is_not_a_complete_key():
    from tools.p104_secret_scan import unsafe_content
    assert not unsafe_content(b'parser: -----BEGIN PRIVATE KEY-----\x00read input')


def test_secret_scan_rejects_complete_key_candidate():
    from tools.p104_secret_scan import unsafe_content
    header=b'-----BEGIN '+b'PRIVATE KEY-----\n'
    assert unsafe_content(header+b'A'*64+b'\n-----END '+b'PRIVATE KEY-----')
