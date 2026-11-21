"""Disposable P41 persistence and read-load checks; fixed loopback target only."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import signal
import statistics
import subprocess
import time

import httpx
from bson.json_util import dumps
from pymongo import MongoClient

assert os.environ["DB_NAME"] == "apollo_p40_browser_fictitious"
base = "http://127.0.0.1:8001"
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
with httpx.Client(base_url=base, headers={"Origin": base}) as client:
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
        process = subprocess.Popen(["python", "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8001"],
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
