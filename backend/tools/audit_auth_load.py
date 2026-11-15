"""Synthetic authentication isolation benchmark, not a whole-PDV load test.

Run from backend: MONGO_URL=mongodb://127.0.0.1:27027 DB_NAME=apollo_audit_synthetic
python tools/audit_auth_load.py --output result.json
Uses real login route/bcrypt/HTTP keep-alive; database IO is a synthetic adapter.
No production connections, fixtures, credentials or writes.
"""
import argparse
import asyncio
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def serve(port):
    import bcrypt
    from fastapi import FastAPI
    import uvicorn
    from lib import auth
    from routers import auth as routes

    hashed = bcrypt.hashpw(b"synthetic-password", bcrypt.gensalt(rounds=12)).decode()
    class Collection:
        async def find_one(self, query, *args, **kwargs):
            if query.get("username") == "synthetic":
                return {"id": "synthetic", "name": "Synthetic", "role": "caixa",
                        "active": True, "password_hash": hashed}
            return None
        async def insert_one(self, *args, **kwargs):
            pass
        async def delete_one(self, *args, **kwargs):
            pass
    store = SimpleNamespace(employees=Collection(), sessions=Collection(), login_attempts=Collection())
    auth.db = routes.db = store
    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    @app.get("/probe")
    async def probe():
        return {"ok": True}
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error", access_log=False)


def percentile(values, p):
    values = sorted(values)
    return round(values[min(len(values)-1, math.ceil(len(values)*p)-1)], 2) if values else None


async def measure(port):
    import httpx
    url = f"http://127.0.0.1:{port}"
    rows = []
    async with httpx.AsyncClient(base_url=url, timeout=60, trust_env=False) as probe:
        for _ in range(100):
            try:
                await probe.get('/probe')
                break
            except httpx.TransportError:
                await asyncio.sleep(.1)
        else:
            raise RuntimeError("Isolated test server did not start")
        for count in (1, 5, 10, 20, 30, 50):
            clients = [httpx.AsyncClient(base_url=url, timeout=60, trust_env=False,
                       limits=httpx.Limits(max_connections=1, max_keepalive_connections=1)) for _ in range(count)]
            latencies, probes, errors = [], [], []
            async def login(client):
                start = time.perf_counter()
                try:
                    # Same client performs two requests on its persistent connection.
                    response = await client.get('/probe')
                    response.raise_for_status()
                    response = await client.post('/api/auth/login', json={
                        "username": "synthetic", "password": "synthetic-password"})
                    response.raise_for_status()
                except Exception as exc:
                    errors.append(type(exc).__name__)
                latencies.append((time.perf_counter()-start)*1000)
            start = time.perf_counter()
            tasks = [asyncio.create_task(login(c)) for c in clients]
            while any(not t.done() for t in tasks):
                before = time.perf_counter()
                try:
                    response = await probe.get('/probe')
                    response.raise_for_status()
                    probes.append((time.perf_counter()-before)*1000)
                except Exception as exc:
                    errors.append('probe:'+type(exc).__name__)
                await asyncio.sleep(.02)
            await asyncio.gather(*tasks)
            elapsed = time.perf_counter()-start
            for client in clients:
                await client.aclose()
            rows.append({"sessions":count,"login_p50_ms":percentile(latencies,.5),
                         "login_p95_ms":percentile(latencies,.95),"login_p99_ms":percentile(latencies,.99),
                         "probe_p95_ms":percentile(probes,.95),"probe_max_ms":round(max(probes),2),
                         "errors":errors,"error_rate":len(errors)/count,
                         "login_throughput_s":round(count/elapsed,2),"elapsed_s":round(elapsed,3),
                         "probe_samples":len(probes)})
    return rows

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--port', type=int, default=28191)
    parser.add_argument('--output')
    args = parser.parse_args()
    if args.serve:
        serve(args.port)
    else:
        process = subprocess.Popen([sys.executable, __file__, '--serve', '--port', str(args.port)])
        try:
            result = {"scope":"synthetic DB; real HTTP keep-alive, login route and bcrypt cost 12",
                      "python":sys.version,"rows":asyncio.run(measure(args.port))}
            Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps(result,indent=2))
        finally:
            process.terminate()
            process.wait(timeout=10)
