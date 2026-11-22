#!/usr/bin/env bash
set -euo pipefail
scratch="$(mktemp -d)"
container="apollo-p57-apache-$$"
backend_pid=
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ -n "$backend_pid" ]]; then kill "$backend_pid" 2>/dev/null || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
build_dir="$(realpath "${APOLLO_TEST_BUILD:-frontend/dist}")"
template="$(realpath deploy/vps/apache-web.conf)"
export APOLLO_TEST_BUILD="$build_dir"
export APOLLO_TEST_COMMIT="$(git rev-parse HEAD)"
EXPECTED_COMMIT="$APOLLO_TEST_COMMIT" node frontend/scripts/verify-build.mjs "$build_dir"

python - <<'PY' &
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        status = {"/api": 200, "/api/": 200, "/api/auth/me": 401}.get(url.path, 404)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"query": url.query} if status == 200 else {"error": status}).encode())

ThreadingHTTPServer(("127.0.0.1", 18058), Backend).serve_forever()
PY
backend_pid=$!

cat > "$scratch/vhost.conf" <<'APACHE'
Listen 127.0.0.1:18057
Define APOLLO_DOCUMENT_ROOT /opt/apollo-dist
Define APOLLO_BACKEND_ORIGIN http://127.0.0.1:18058
ServerName localhost
<VirtualHost 127.0.0.1:18057>
    Include /opt/apollo-web.conf
</VirtualHost>
APACHE
chmod 644 "$scratch/vhost.conf"
docker run -d --name "$container" --network host \
  -v "$build_dir:/opt/apollo-dist:ro" \
  -v "$template:/opt/apollo-web.conf:ro" \
  -v "$scratch/vhost.conf:/opt/apollo-test-vhost.conf:ro" \
  httpd:2.4 sh -ec '
    sed -i "/^Listen 80$/d; s/^#LoadModule \(proxy_module\|proxy_http_module\|headers_module\|rewrite_module\)/LoadModule \1/" conf/httpd.conf
    printf "\nInclude /opt/apollo-test-vhost.conf\n" >> conf/httpd.conf
    httpd -t
    exec httpd-foreground
  '
for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:18057/build-integrity.json >/dev/null; then break; fi
    sleep 1
done
python deploy/vps/test-apache-web.py || { docker logs "$container"; exit 1; }
node tests/apache-worker.mjs
