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
export APOLLO_TEST_COMMIT="$(git rev-parse HEAD)"
EXPECTED_COMMIT="$APOLLO_TEST_COMMIT" node frontend/scripts/verify-build.mjs "$build_dir"
mkdir "$scratch/site"
chmod 755 "$scratch"
ln -s site "$scratch/live"
cp -a "$build_dir/." "$scratch/site/"
export APOLLO_TEST_BUILD="$scratch/site"

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
Define APOLLO_DOCUMENT_ROOT /opt/apollo-releases/live
Define APOLLO_BACKEND_ORIGIN http://127.0.0.1:18058
ServerName localhost
<Directory />
    FallbackResource /index.html
    ErrorDocument 404 /index.html
</Directory>
<Directory "/opt/apollo-releases">
    Options +FollowSymLinks
</Directory>
<VirtualHost 127.0.0.1:18057>
    Include /opt/apollo-web.conf
</VirtualHost>
APACHE
chmod 644 "$scratch/vhost.conf"
docker run -d --name "$container" --network host \
  -v "$scratch:/opt/apollo-releases:ro" \
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
mv "$APOLLO_TEST_BUILD/build-integrity.json" "$scratch/audited-build-integrity.json"
status="$(curl -sS -o "$scratch/missing-manifest.html" -w '%{http_code}' http://127.0.0.1:18057/build-integrity.json)"
test "$status" = 404
! cmp -s "$scratch/missing-manifest.html" "$APOLLO_TEST_BUILD/index.html"
printf 'Apache: manifesto removido devolveu HTTP %s.\n' "$status"

mv "$scratch/audited-build-integrity.json" "$APOLLO_TEST_BUILD/build-integrity.json"

# Only the isolated container uses this disposable release pointer.
if [[ -n "${APOLLO_TEST_PREVIOUS_BUILD:-}" ]]; then
    previous_commit="${APOLLO_TEST_PREVIOUS_COMMIT:?Missing previous release SHA}"
    mkdir "$scratch/previous"
    cp -a "$APOLLO_TEST_PREVIOUS_BUILD/." "$scratch/previous/"
    cp "$scratch/previous/build-integrity.json" "$scratch/previous-audited.json"
    cp "$scratch/site/build-integrity.json" "$scratch/candidate-audited.json"

    switch_lab_release() {
        ln -s "$1" "$scratch/next"
        mv -T "$scratch/next" "$scratch/live"
    }

    EXPECTED_COMMIT="$previous_commit" EXPECTED_MANIFEST="$scratch/previous-audited.json" \
        node frontend/scripts/verify-build.mjs "$scratch/previous"
    switch_lab_release previous
    APOLLO_TEST_COMMIT="$previous_commit" APOLLO_TEST_BUILD="$scratch/previous" python deploy/vps/test-apache-web.py
    printf 'Rollback lab [%s] [%s] previous=%s\n' "$(date -u +%FT%TZ)" "$(id -un)" "$previous_commit"

    cp -a "$scratch/site" "$scratch/corrupt"
    printf '\nchanged\n' >> "$scratch/corrupt/index.html"
    if EXPECTED_MANIFEST="$scratch/candidate-audited.json" node frontend/scripts/verify-build.mjs "$scratch/corrupt"; then
        echo 'Rollback lab: invalid package unexpectedly passed' >&2
        exit 1
    fi
    APOLLO_TEST_COMMIT="$previous_commit" APOLLO_TEST_BUILD="$scratch/previous" python deploy/vps/test-apache-web.py
    EXPECTED_COMMIT="$APOLLO_TEST_COMMIT" EXPECTED_MANIFEST="$scratch/candidate-audited.json" \
        node frontend/scripts/verify-build.mjs "$scratch/site"
    switch_lab_release site
    python deploy/vps/test-apache-web.py
    printf 'Rollback lab [%s] [%s] candidate=%s\n' "$(date -u +%FT%TZ)" "$(id -un)" "$APOLLO_TEST_COMMIT"

    # Simulate a post-switch publication failure, leaving the previous tree intact.
    mv "$scratch/site/build-integrity.json" "$scratch/failed-manifest.json"
    test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18057/build-integrity.json)" = 404
    switch_lab_release previous
    APOLLO_TEST_COMMIT="$previous_commit" APOLLO_TEST_BUILD="$scratch/previous" python deploy/vps/test-apache-web.py
    printf 'Rollback lab [%s] [%s] restored=%s after candidate manifest HTTP 404\n' \
        "$(date -u +%FT%TZ)" "$(id -un)" "$previous_commit"
fi
