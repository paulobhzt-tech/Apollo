"""Disposable P41 persistence and read-load checks; fixed loopback target only."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

import ssl
import httpx
from bson.json_util import dumps
from pymongo import MongoClient

assert os.environ["DB_NAME"] == "apollo_p40_browser_fictitious"
base = "https://127.0.0.1:8001"
out = Path("evidence")
db = MongoClient(os.environ["MONGO_URL"], tz_aware=True)[os.environ["DB_NAME"]]
collections = ["orders", "ingredients", "purchases", "stock_moves", "lot_consumptions",
               "cash_sessions", "tables", "kitchen_tickets"]
def snapshot():
    result = {}
    for name in collections:
        rows = list(db[name].find().sort("_id", 1))
        result[name] = {"count": len(rows), "sha256": hashlib.sha256(dumps(rows, sort_keys=True).encode()).hexdigest()}
    return result
before = snapshot()
with httpx.Client(base_url=base, headers={"Origin": base}, verify=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")) as client:
    response = client.post("/api/auth/login", json={"username": "p40admin", "password": "P40-Fictitious-Password!"})
    response.raise_for_status()
    cookies = dict(client.cookies)
    # Acceptance thresholds declared before the load: no failed HTTP requests and p95 <= 2 seconds.
    def request(index):
        start = time.monotonic()
        r = client.get("/api/tables" if index % 2 else "/api/products", timeout=10)
        r.raise_for_status()
        return time.monotonic() - start
    loads = []
    for workers in (10, 30):
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            latencies = list(pool.map(request, range(100)))
        p95 = sorted(latencies)[94]
        loads.append({"workers": workers, "requests": 100, "p95_seconds": p95, "maximum_seconds": max(latencies)})
        assert p95 <= 2, loads[-1]
    (out / "read-load.json").write_text(json.dumps(loads, indent=2))
    pid = int((out / "backend.pid").read_text())
    assert b"uvicorn" in Path(f"/proc/{pid}/cmdline").read_bytes()
    os.kill(pid, signal.SIGTERM)
    subprocess.run(["docker", "restart", "apollo-p40-mongo"], check=True)
    for _ in range(60):
        try:
            if db.client.admin.command("hello").get("isWritablePrimary"):
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise AssertionError("Replica did not recover")
    with (out / "restarted-backend.log").open("w") as log:
        process = subprocess.Popen(["python", "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8001", "--ssl-keyfile", "/tmp/apollo-p41-tls/server.key", "--ssl-certfile", "/tmp/apollo-p41-tls/server.crt"],
                                   cwd="backend", stdout=log, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            if client.get("/api/").status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    else:
        raise AssertionError("Backend did not recover")
    client.get("/api/auth/me").raise_for_status()
after = snapshot()
(out / "restart-integrity.json").write_text(json.dumps({"before": before, "after": after, "same": before == after}, indent=2))
assert before == after, "Business collections changed after controlled restart"
print("P41 read load and backend/database persistence checks passed")

# Roll back to the preserved reference in a separate worktree, then replay on P41.
# Only this run's newly seeded database is used by both versions.
rollback_dir = "/tmp/apollo-p41-rollback-reference"
subprocess.run(["git", "worktree", "add", "--detach", rollback_dir,
                "28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec"], check=True)
rollback_base = "https://127.0.0.1:8003"
with (out / "rollback-backend.log").open("w") as log:
    rollback = subprocess.Popen(["python", "-m", "uvicorn", "server:app", "--host", "127.0.0.1",
        "--port", "8003", "--ssl-keyfile", "/tmp/apollo-p41-tls/server.key",
        "--ssl-certfile", "/tmp/apollo-p41-tls/server.crt"], cwd=rollback_dir + "/backend",
        stdout=log, stderr=subprocess.STDOUT)
try:
    with httpx.Client(base_url=rollback_base, headers={"Origin": rollback_base},
                      cookies=cookies, verify=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")) as old:
        for _ in range(60):
            try:
                if old.get("/api/").status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(1)
        else:
            raise AssertionError("Reference version did not start")
        old.get("/api/auth/me").raise_for_status()
        def post(client, path, payload):
            response = client.post("/api" + path, json=payload)
            response.raise_for_status()
            return response.json()
        stock_before = db.ingredients.find_one({"id": "p40ing"})["stock"]
        cash = post(old, "/cash/open", {"opening_amount": 0, "note": "P41 fictitious rollback"})
        payload = {"client_ref": "p41-rollback-reference", "items": [{"product_id": "p40product", "qty": 1}],
                   "payments": [{"method": "pix", "amount": 10}], "emit_invoice": False, "send_to_kitchen": False}
        paid = post(old, "/pdv/sale", payload)
        assert post(old, "/pdv/sale", payload)["order"]["id"] == paid["order"]["id"]
        post(old, "/cash/close", {"expected_session_id": cash["id"], "counted_amount": 0,
                                "note": "P41 rollback reconciled"})
    with httpx.Client(base_url=base, headers={"Origin": base}, cookies=cookies,
                      verify=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")) as candidate:
        candidate.get("/api/auth/me").raise_for_status()
        assert post(candidate, "/pdv/sale", payload)["order"]["id"] == paid["order"]["id"]
    assert db.orders.count_documents({"client_ref": payload["client_ref"]}) == 1
    stock_after = db.ingredients.find_one({"id": "p40ing"})["stock"]
    assert stock_after == stock_before - 1
    result = {"reference": "28ea95ce50863c7c3ce8368b91e8d98a6a5b99ec",
              "candidate": (out / "commit.txt").read_text().strip(),
              "order": paid["order"]["id"], "orders_for_reference": 1,
              "stock_before": stock_before, "stock_after": stock_after,
              "scope": "Process rollback/reference operation/P41 replay over HTTPS, same disposable database; not destination infrastructure or container-image rollback"}
    (out / "rollback-integrity.json").write_text(json.dumps(result, indent=2))
    print("P41 process rollback and return with idempotent sale passed")
finally:
    rollback.terminate()
    rollback.wait(timeout=15)
