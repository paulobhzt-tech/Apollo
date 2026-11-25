#!/usr/bin/env bash
# Run every browser spec against a fresh fixture. Both profiles retain the same coverage.
set -euo pipefail
cd "$(dirname "$0")/.."
profile=${1:?Informe desktop ou mobile}
case "$profile" in desktop|mobile) ;; *) exit 2 ;; esac
export MONGO_URL='mongodb://127.0.0.1:27017/?replicaSet=rs0'
export APOLLO_CASH_MODE=operator COOKIE_SECURE=true
export APOLLO_E2E_BASE_URL=https://127.0.0.1:8001
export CORS_ORIGINS="$APOLLO_E2E_BASE_URL"
export SERVE_FRONTEND_DIR="$PWD/frontend/dist"
tls=/tmp/apollo-p41-tls
python local-server/gerar-certificado.py "$tls" 127.0.0.1
export APOLLO_TEST_TLS_SPKI
APOLLO_TEST_TLS_SPKI=$(openssl x509 -in "$tls/server.crt" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64)
export NODE_EXTRA_CA_CERTS="$tls/apollo-local-ca.crt"
export APOLLO_TEST_CA_PATH="$NODE_EXTRA_CA_CERTS"
mkdir -p evidence
server_pid=
stop_server() {
    if [[ -n "$server_pid" ]]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" || true
        server_pid=
    fi
}
trap stop_server EXIT

result=0
index=0
for spec in tests/e2e/*.spec.ts; do
    name=$(basename "$spec" .spec.ts)
    index=$((index + 1))
    export DB_NAME="apollo_p40_browser_p645_${profile}_${index}"
    if [[ "$name" == p58-integrated-shift ]]; then
        export DB_NAME=apollo_p40_browser_p58_integrated
    fi
    python backend/p40_seed_ci.py
    python -m uvicorn server:app --app-dir backend --host 127.0.0.1 --port 8001 \
        --ssl-keyfile "$tls/server.key" --ssl-certfile "$tls/server.crt" > "evidence/$name-backend.log" 2>&1 &
    server_pid=$!
    for attempt in {1..30}; do
        if curl --cacert "$NODE_EXTRA_CA_CERTS" -fsS "$APOLLO_E2E_BASE_URL/api/" > "evidence/$name-health.json"; then break; fi
        if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
        sleep 1
    done
    test -s "evidence/$name-health.json" || { cat "evidence/$name-backend.log"; exit 1; }
    if ! (cd tests && APOLLO_PLAYWRIGHT_BASE_URL="$APOLLO_E2E_BASE_URL" npx playwright test \
        --project="$profile" --trace retain-on-failure --output="test-results/$name" --reporter=list "e2e/$name.spec.ts") \
        2>&1 | tee "evidence/$name-playwright.log"; then
        result=1
    fi
    stop_server
done
exit "$result"
