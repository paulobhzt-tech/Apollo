import gzip
import hashlib
import json

import pytest

from lib.restore_recovery import inspect_restore_snapshot


def snapshot(data):
    raw = json.dumps({"data": data}).encode()
    return {"blob": gzip.compress(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def test_valid_snapshot_reports_only_safe_metadata():
    assert inspect_restore_snapshot(snapshot({"products": [{"id": "p"}], "employees": [{"password_hash": "secret"}]})) == {
        "verified": True, "collections": 2, "records": 2,
    }


def test_corrupt_hash_fails_closed():
    item = snapshot({"products": [{"id": "p"}]})
    item["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="SHA256"):
        inspect_restore_snapshot(item)


def test_corrupt_compressed_blob_fails_closed():
    item = snapshot({"products": [{"id": "p"}]})
    item["blob"] = b"broken"
    with pytest.raises(ValueError, match="comprimida"):
        inspect_restore_snapshot(item)


@pytest.mark.parametrize("data", [{}, {"products": "wrong"}, {"products": [None]}])
def test_invalid_structure_fails_closed(data):
    with pytest.raises(ValueError):
        inspect_restore_snapshot(snapshot(data))


def test_missing_metadata_fails_closed():
    with pytest.raises(ValueError):
        inspect_restore_snapshot({"blob": b"irrelevant"})
