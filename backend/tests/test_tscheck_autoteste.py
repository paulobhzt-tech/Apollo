"""Auto teste refactor: POST /api/selftest returns 11 server checks + auth enforcement."""
from contextlib import closing

from .conftest import seeded_operator_client


def test_selftest_admin_ok():
    c = seeded_operator_client("p40admin")
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
    with closing(seeded_operator_client("p40caixa1")) as client:
        response = client.post("/selftest")
        assert response.status_code == 403, response.text
