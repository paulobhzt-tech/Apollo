#!/usr/bin/env bash
# Executar no Linux da VPS; salvar em disco protegido e copiar para destino externo.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
BACKUP_DIR="${BACKUP_DIR:-/var/backups/apollo-pdv}"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/apollo-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
tmp="${out}.partial"
checksum_tmp="${out}.sha256.partial"
trap 'rm -f "$tmp" "$checksum_tmp"' EXIT
docker compose exec -T mongo sh -c 'exec mongodump --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --db apollo_pdv --archive --gzip' > "$tmp"
test -s "$tmp"
# Reject truncated/corrupt archives before publishing or rotating backups.
gzip -t "$tmp"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$tmp")" | sed "s/$(basename "$tmp")/$(basename "$out")/") > "$checksum_tmp"
mv "$tmp" "$out"
mv "$checksum_tmp" "${out}.sha256"
trap - EXIT
find "$BACKUP_DIR" -type f \( -name 'apollo-*.archive.gz' -o -name 'apollo-*.archive.gz.sha256' \) -mtime +6 -delete
echo "Backup local criado: $out"
