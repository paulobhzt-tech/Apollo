"""CSRF same-origin checks: unauthenticated public routes remain accessible."""
from lib.csrf import origin_allowed


def test_same_origin_allowed():
    assert origin_allowed("https://192.168.0.10:8001", "192.168.0.10:8001", "same-origin")


def test_external_site_blocked():
    assert not origin_allowed("https://evil.example", "192.168.0.10:8001", "cross-site")


def test_null_origin_blocked():
    assert not origin_allowed("null", "192.168.0.10:8001", None)


def test_missing_origin_requires_fetch_metadata():
    assert origin_allowed(None, "192.168.0.10:8001", "same-origin")
    assert not origin_allowed(None, "192.168.0.10:8001", None)
    assert not origin_allowed(None, "192.168.0.10:8001", "cross-site")


def test_sibling_subdomain_blocked():
    assert not origin_allowed("https://other.example.com", "pdv.example.com", "same-site")


def test_scheme_downgrade_blocked():
    assert not origin_allowed("http://192.168.0.10:8001", "192.168.0.10:8001", "same-origin", "https")
