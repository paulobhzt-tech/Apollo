#!/usr/bin/env bash
# Executar no Linux da VPS; salvar em disco protegido e copiar para destino externo.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
BACKUP_DIR="${BACKUP_DIR:-/var/backups/apollo-pdv}"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/apollo-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
tmp="${out}.partial"
trap 'rm -f "$tmp"' EXIT
docker compose exec -T mongo sh -c 'exec mongodump --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --db apollo_pdv --archive --gzip' > "$tmp"
test -s "$tmp"
mv "$tmp" "$out"
trap - EXIT
find "$BACKUP_DIR" -type f -name 'apollo-*.archive.gz' -mtime +6 -delete
echo "Backup local criado: $out"
