#!/usr/bin/env bash
set -euo pipefail
# Docker's root entrypoint drops privileges after this private key copy.
install -d -m 700 -o mongodb -g mongodb /data/configdb
install -m 400 -o mongodb -g mongodb /run/secrets/replica.key /data/configdb/replica.key
exec /usr/local/bin/docker-entrypoint.sh "$@"
