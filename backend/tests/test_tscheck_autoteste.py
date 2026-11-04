"""Auto teste refactor: POST /api/selftest returns 11 server checks + auth enforcement."""
import httpx

from .conftest import api_url


def _login(pin: str) -> httpx.Client:
    c = httpx.Client(base_url=api_url(), timeout=30.0)
    r = c.post("/auth/login", json={"pin": pin})
    assert r.status_code == 200, r.text
    # The session cookie is Secure; httpx's cookiejar won't replay it over plain http.
    # Set it directly as a request header instead of relying on cookie-jar behaviour.
    token = r.cookies.get("pdv_session")
    c.headers["Cookie"] = f"pdv_session={token}"
    return c


def test_selftest_admin_ok():
    c = _login("1234")
    try:
        r = c.post("/selftest")
        assert r.status_code == 200, r.text
        body = r.json()
        checks = body["checks"]
        assert len(checks) == 11, f"expected 11 server checks, got {len(checks)}: {[c['key'] for c in checks]}"
        statuses = {chk["status"] for chk in checks}
        assert statuses <= {"ok", "aviso", "falha"}
        ok = sum(1 for chk in checks if chk["status"] == "ok")
        warn = sum(1 for chk in checks if chk["status"] == "aviso")
        fail = sum(1 for chk in checks if chk["status"] == "falha")
        assert body["ok"] == ok and body["warnings"] == warn and body["failures"] == fail
        assert ok + warn + fail == len(checks)
    finally:
        c.close()


def test_selftest_non_admin_forbidden():
    admin = _login("1234")
    try:
        pin = "9871"
        admin.post("/employees", json={"name": "tscheck-selftest-caixa", "role": "caixa", "pin": pin})
        c = _login(pin)
        try:
            r = c.post("/selftest")
            assert r.status_code == 403, r.text
        finally:
            c.close()
    finally:
        admin.close()
