#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
: "${MONGO_URL:?Informe a réplica MongoDB descartável em loopback}"
: "${APOLLO_DISPOSABLE_TESTS:?Confirme que a réplica é exclusiva para testes}"
[[ "$APOLLO_DISPOSABLE_TESTS" == 1 ]]
python_cmd=${APOLLO_TEST_PYTHON:-python}
"$python_cmd" - <<'PY'
import os
from urllib.parse import urlsplit
url = urlsplit(os.environ["MONGO_URL"])
if url.scheme != "mongodb" or url.hostname != "127.0.0.1" or "," in url.netloc:
    raise SystemExit("Use uma única réplica descartável acessada por 127.0.0.1.")
PY
fixtures=$(mktemp -d)
server_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -rf "$fixtures"
}
trap cleanup EXIT
suffix=$("$python_cmd" -c 'from uuid import uuid4; print(uuid4().hex[:12])')
status=0
run() { "$python_cmd" -m pytest -n 0 -q "$@" || status=1; }

# Keep the restore fixture on an untouched database. Start the seeded HTTP
# server only for tests that exercise it, since startup itself writes indexes.
export APOLLO_CASH_MODE=shared APOLLO_ALLOW_DISPOSABLE_RESTORE=1
export DB_NAME="apollo_restore_test_full_$suffix"
files=()
for file in tests/test_*.py; do
  case "$file" in
    tests/test_tscheck_*|tests/test_restore_disposable_integration.py|tests/test_partial_payment_integration.py|tests/test_table_merge_integration.py) ;;
    *) files+=("$file") ;;
  esac
done
run "${files[@]}"
export DB_NAME="apollo_restore_test_empty_$suffix"
run tests/test_restore_disposable_integration.py
export DB_NAME="apollo_partial_ci_$suffix"
run tests/test_partial_payment_integration.py tests/test_table_merge_integration.py

port=${APOLLO_TEST_PORT:-18650}
export DB_NAME="apollo_p40_browser_full_$suffix" APOLLO_CASH_MODE=operator APOLLO_DEMO_MODE=true
export COOKIE_SECURE=true BACKEND_URL="https://127.0.0.1:$port"
export CORS_ORIGINS="$BACKEND_URL"
"$python_cmd" ../local-server/gerar-certificado.py "$fixtures" 127.0.0.1
export APOLLO_TEST_CA_PATH="$fixtures/apollo-local-ca.crt" SSL_CERT_FILE="$fixtures/apollo-local-ca.crt"
"$python_cmd" p40_seed_ci.py
"$python_cmd" -m uvicorn server:app --host 127.0.0.1 --port "$port" \
  --ssl-keyfile "$fixtures/server.key" --ssl-certfile "$fixtures/server.crt" >"$fixtures/server.log" 2>&1 &
server_pid=$!
if ! curl --retry 12 --retry-connrefused --retry-delay 1 --cacert "$APOLLO_TEST_CA_PATH" -fsS "$BACKEND_URL/api/"; then
  cat "$fixtures/server.log"
  exit 1
fi
run tests/test_tscheck_*.py
exit "$status"
