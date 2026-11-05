"""Regression tests for employee PIN hashing and legacy PIN verification."""
from lib.auth import hash_pin, secure_hash_pin, verify_pin


def test_new_pin_is_salted_and_verifiable():
    a = secure_hash_pin("749216")
    b = secure_hash_pin("749216")
    assert a != b
    assert a.startswith("$2")
    assert verify_pin("749216", a)
    assert not verify_pin("749215", a)


def test_legacy_pin_is_accepted_for_migration():
    legacy = hash_pin("749216")
    assert verify_pin("749216", legacy)
    assert not verify_pin("749215", legacy)


def test_malformed_hash_rejected():
    assert not verify_pin("749216", "not-a-valid-hash")
