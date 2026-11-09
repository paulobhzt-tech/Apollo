#!/usr/bin/env bash
# Restore drill in an isolated, disposable MongoDB container. NEVER touches production.
# Usage: ./restore-drill.sh /var/backups/apollo-pdv/apollo-YYYYMMDDTHHMMSSZ.archive.gz
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Uso: $0 arquivo.archive.gz" >&2; exit 2; fi
archive="$(realpath "$1")"
[[ -f "$archive" && -s "$archive" ]] || { echo "Backup ausente ou vazio" >&2; exit 2; }
checksum="${archive}.sha256"
[[ -f "$checksum" ]] || { echo "Checksum ausente: $checksum" >&2; exit 2; }
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")")
gzip -t "$archive"
command -v docker >/dev/null || { echo "Docker nao instalado" >&2; exit 2; }
container="apollo-restore-drill-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No published ports, no host volumes, no network. Mongo data is discarded on exit.
docker run -d --name "$container" --network none mongo:7.0 --bind_ip 127.0.0.1 >/dev/null
ready=0
for _ in $(seq 1 40); do
  if docker exec "$container" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" -eq 1 ]] || { echo "Mongo isolado nao iniciou" >&2; exit 1; }
docker exec -i "$container" mongorestore --archive --gzip --nsFrom='apollo_pdv.*' --nsTo='apollo_restore_drill.*' --stopOnError < "$archive"
count="$(docker exec "$container" mongosh --quiet apollo_restore_drill --eval 'db.getCollectionNames().length')"
[[ "$count" =~ ^[0-9]+$ ]] && [[ "$count" -gt 0 ]] || { echo "Restauracao sem colecoes" >&2; exit 1; }
echo "RESTORE_DRILL_PASS: $count colecoes restauradas em Mongo isolado; producao intocada"
