#!/usr/bin/env bash
set -euo pipefail
umask 022
scratch="$(mktemp -d)"
container="apollo-p57-apache-$$"
backup=
backend_pid=
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ -n "$backend_pid" ]]; then kill "$backend_pid" 2>/dev/null || true; fi
  rm -rf "$scratch"
  if [[ -n "$backup" ]]; then rm -rf "$backup"; fi
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
chmod -R a+rX "$scratch/site"
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
    backup="$(mktemp -d)"
    prior="$scratch/$previous_commit"
    candidate="$scratch/$APOLLO_TEST_COMMIT"
    mkdir "$prior"
    cp -a "$APOLLO_TEST_PREVIOUS_BUILD/." "$prior/"
    chmod -R a+rX "$prior"
    mv "$scratch/site" "$candidate"
    cp "$prior/build-integrity.json" "$backup/previous-audited.json"
    cp "$candidate/build-integrity.json" "$backup/candidate-audited.json"
    cp "$scratch/vhost.conf" "$backup/vhost.conf"
    cp "$template" "$backup/apache-web.conf"
    tar -C "$prior" -cf "$backup/previous.tar" .
    (cd "$backup"
     sha256sum previous.tar vhost.conf apache-web.conf > SHA256SUMS
     sha256sum -c SHA256SUMS)
    mkdir "$backup/restore-check"
    tar -C "$backup/restore-check" -xf "$backup/previous.tar"
    EXPECTED_COMMIT="$previous_commit" EXPECTED_MANIFEST="$backup/previous-audited.json" \
        node frontend/scripts/verify-build.mjs "$backup/restore-check"
    ln -s "$previous_commit" "$scratch/next"
    mv -T "$scratch/next" "$scratch/live"
    APOLLO_TEST_COMMIT="$previous_commit" APOLLO_TEST_BUILD="$prior" python deploy/vps/test-apache-web.py
    docker exec "$container" httpd -t

    switch=(python deploy/vps/switch-verified-release.py "$scratch")
    if "${switch[@]}" "$APOLLO_TEST_COMMIT" "$previous_commit" "$backup/candidate-audited.json" "$backup/previous-audited.json"; then
        echo 'Stale expected pointer unexpectedly passed' >&2; exit 1
    fi
    cp "$candidate/index.html" "$backup/index.html"
    printf '\nchanged\n' >> "$candidate/index.html"
    if "${switch[@]}" "$previous_commit" "$APOLLO_TEST_COMMIT" "$backup/previous-audited.json" "$backup/candidate-audited.json"; then
        echo 'Invalid candidate unexpectedly passed' >&2; exit 1
    fi
    test "$(readlink "$scratch/live")" = "$previous_commit"
    cp "$backup/index.html" "$candidate/index.html"
    "${switch[@]}" "$previous_commit" "$APOLLO_TEST_COMMIT" "$backup/previous-audited.json" "$backup/candidate-audited.json"
    APOLLO_TEST_BUILD="$candidate" python deploy/vps/test-apache-web.py
    APOLLO_TEST_BUILD="$candidate" node tests/apache-worker.mjs
    if "${switch[@]}" "$APOLLO_TEST_COMMIT" "$previous_commit" "$backup/candidate-audited.json" "$backup/restore-check/build-integrity.json.bad"; then
        echo 'Missing rollback reference unexpectedly passed' >&2; exit 1
    fi
    mv "$candidate/build-integrity.json" "$backup/failed-manifest.json"
    test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18057/build-integrity.json)" = 404
    "${switch[@]}" "$APOLLO_TEST_COMMIT" "$previous_commit" "$backup/candidate-audited.json" "$backup/previous-audited.json" --rollback
    APOLLO_TEST_COMMIT="$previous_commit" APOLLO_TEST_BUILD="$prior" python deploy/vps/test-apache-web.py
    APOLLO_TEST_BUILD="$prior" node tests/apache-worker.mjs
    printf 'Rollback lab [%s] [%s] restored=%s after candidate manifest HTTP 404\n' \
        "$(date -u +%FT%TZ)" "$(id -un)" "$previous_commit"
fi
