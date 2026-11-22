"""Run against a disposable Apache reverse proxy and immutable local build."""
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

origin = "http://127.0.0.1:18057"
build = Path(os.environ.get("APOLLO_TEST_BUILD", "frontend/dist"))
manifest = json.loads((build / "build-integrity.json").read_text())


def response(path, method="GET"):
    try:
        result = urlopen(Request(origin + path, method=method), timeout=10)
    except HTTPError as err:
        result = err
    with result:
        return result.status, result.headers.get_content_type(), dict(result.headers), result.read()


status, mime, headers, body = response("/build-integrity.json")
assert (status, mime) == (200, "application/json"), (status, mime)
assert "no-cache" in headers.get("Cache-Control", ""), headers
assert json.loads(body) == manifest
assert manifest["commit"] == os.environ["APOLLO_TEST_COMMIT"]
for filename, digest in manifest["files"].items():
    status, _, _, body = response("/" + filename)
    assert status == 200 and hashlib.sha256(body).hexdigest() == digest, filename

for route in ("/login", "/mesas-offline", "/mesas"):
    status, mime, headers, body = response(route)
    assert (status, mime) == (200, "text/html"), route
    assert hashlib.sha256(body).hexdigest() == manifest["files"]["index.html"], route
    assert "no-cache" in headers.get("Cache-Control", ""), route

status, mime, headers, body = response("/sw.js")
assert (status, mime) == (200, "application/javascript")
assert "no-cache" in headers.get("Cache-Control", "")
assert b"apollo-public-v2" not in body
for path in ("/assets/missing.js", "/missing.json", "/missing.js"):
    assert response(path)[0] == 404, path
assert response("/login", "POST")[0] in (404, 405)
assert response("/api")[0] == 200
assert json.loads(response("/api/?probe=p57")[3]) == {"query": "probe=p57"}
assert response("/api/auth/me")[:2] == (401, "application/json")
assert response("/api/missing")[:2] == (404, "application/json")
print(f"Apache: {len(manifest['files'])} arquivos íntegros; rotas Web, API, proteção e erros verificados.")
