#!/usr/bin/env bash
# Run on the Docker host, with configuration from a protected EnvironmentFile.
set -euo pipefail
umask 077

: "${APOLLO_BACKUP_COMPOSE_FILE:?Informe o caminho absoluto do Compose}"
: "${APOLLO_BACKUP_PROJECT:?Informe o projeto Compose da instância}"
: "${APOLLO_BACKUP_STATE:?Informe o diretório privado de trabalho}"
: "${APOLLO_BACKUP_RECIPIENT:?Informe a chave pública age}"
: "${APOLLO_BACKUP_REMOTE:?Informe um remoto rclone com prefixo exclusivo}"
: "${RCLONE_CONFIG:?Informe o caminho da configuração privada do rclone}"
database="${APOLLO_BACKUP_DATABASE:-apollo_pdv}"
[[ "$database" =~ ^[a-zA-Z0-9_-]+$ ]]
[[ "$APOLLO_BACKUP_REMOTE" =~ ^[a-zA-Z0-9_-]+:[^[:space:]]+$ ]]
[[ -r "$RCLONE_CONFIG" ]]

mkdir -p "$APOLLO_BACKUP_STATE"
exec 9>"$APOLLO_BACKUP_STATE/run.lock"
if ! flock -n 9; then
  echo 'Backup em andamento. A execução concorrente foi ignorada.'
  exit 0
fi
work="$(mktemp -d "$APOLLO_BACKUP_STATE/backup.XXXXXXXX")"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
trap 'echo "Falha no backup externo do Apollo" >&2' ERR

name="apollo-$(date -u +%Y%m%dT%H%M%SZ)-${work##*.}.archive.gz.age"
archive="$work/$name"
destination="${APOLLO_BACKUP_REMOTE%/}/$name"
echo "Iniciando backup externo: $name"

docker compose -f "$APOLLO_BACKUP_COMPOSE_FILE" -p "$APOLLO_BACKUP_PROJECT" exec -T mongo sh -ec '
  exec mongodump --authenticationDatabase admin --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" --db "$1" --archive --gzip
' sh "$database" | age --encrypt --recipient "$APOLLO_BACKUP_RECIPIENT" --output "$archive"
(cd "$work" && sha256sum "$name" > "$name.sha256")

# Only upload the manifest once the remote bytes match. Restore requires both files.
rclone copyto --immutable --retries 3 --low-level-retries 5 "$archive" "$destination"
expected="$(cut -d ' ' -f 1 "$archive.sha256")"
received="$(rclone cat --low-level-retries 5 "$destination" | sha256sum)"
[[ "${received%% *}" == "$expected" ]] || { echo 'SHA-256 remoto divergente' >&2; exit 1; }
rclone copyto --immutable --retries 3 --low-level-retries 5 "$archive.sha256" "$destination.sha256"
echo "Backup externo verificado: $name, $(wc -c < "$archive") bytes, SHA-256 $expected"
