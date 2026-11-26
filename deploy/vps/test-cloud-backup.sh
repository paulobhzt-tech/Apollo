#!/usr/bin/env bash
# Real Mongo dump, encrypted SFTP transfer and isolated restore with fictitious data.
set -euo pipefail
umask 077
scripts="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fixture="$(mktemp -d)"
export APOLLO_BACKUP_COMPOSE_FILE="$fixture/compose.yaml"
export APOLLO_BACKUP_PROJECT="apollo-cloud-drill-$$"
export APOLLO_BACKUP_DATABASE="apollo_cloud_fixture"
export APOLLO_BACKUP_STATE="$fixture/state"
export APOLLO_BACKUP_REMOTE="fixture:backups"
export APOLLO_BACKUP_IDENTITY="$fixture/recovery.key"
export RCLONE_CONFIG="$fixture/rclone.conf"
port="${APOLLO_TEST_SFTP_PORT:-20245}"
compose=(docker compose -p "$APOLLO_BACKUP_PROJECT" -f "$APOLLO_BACKUP_COMPOSE_FILE")
cleanup() {
  if [[ -n "${sftp_pid:-}" ]]; then kill "$sftp_pid" 2>/dev/null || true; fi
  "${compose[@]}" down --volumes >/dev/null 2>&1 || true
  rm -rf -- "$fixture"
}
trap cleanup EXIT
mkdir "$fixture/remote"
cat > "$APOLLO_BACKUP_COMPOSE_FILE" <<'YAML'
services:
  mongo:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: fixture
      MONGO_INITDB_ROOT_PASSWORD: fictitious-local-backup-acceptance
    tmpfs:
      - /data/db
      - /data/configdb
YAML

age-keygen -o "$APOLLO_BACKUP_IDENTITY"
APOLLO_BACKUP_RECIPIENT="$(age-keygen -y "$APOLLO_BACKUP_IDENTITY")"
export APOLLO_BACKUP_RECIPIENT
ssh-keygen -q -t ed25519 -N '' -f "$fixture/host"
read -r key_type host_key _ < "$fixture/host.pub"
printf '[127.0.0.1]:%s %s %s\n' "$port" "$key_type" "$host_key" > "$fixture/known_hosts"
sftp_pass=fictitious-local-sftp-acceptance
cat > "$RCLONE_CONFIG" <<CONFIG
[fixture]
type = sftp
host = 127.0.0.1
port = $port
user = fixture
pass = $(rclone obscure "$sftp_pass")
known_hosts_file = $fixture/known_hosts
disable_hashcheck = true
CONFIG
rclone serve sftp "$fixture/remote" --addr "127.0.0.1:$port" --key "$fixture/host" \
  --user fixture --pass "$sftp_pass" > "$fixture/sftp.log" 2>&1 &
sftp_pid=$!
for _ in $(seq 1 20); do
  if rclone lsf fixture: >/dev/null 2>&1; then break; fi
  if ! kill -0 "$sftp_pid" 2>/dev/null; then cat "$fixture/sftp.log"; exit 1; fi
  sleep 1
done
rclone lsf fixture: >/dev/null

"${compose[@]}" up -d mongo
mongo_shell() {
  "${compose[@]}" exec -T mongo mongosh --quiet --authenticationDatabase admin \
    -u fixture -p fictitious-local-backup-acceptance "$@"
}
for _ in $(seq 1 30); do
  if mongo_shell --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; then break; fi
  sleep 1
done
mongo_shell "$APOLLO_BACKUP_DATABASE" \
  --eval 'if (!db.sales.insertOne({_id:"fixture", valueInCents:1200}).acknowledged) quit(1)'
bash "$scripts/backup-cloud.sh"
# Remove the source before the restore, so any subsequent data came from SFTP.
"${compose[@]}" down --volumes
shopt -s nullglob
manifests=("$fixture/remote/backups/"*.sha256)
[[ "${#manifests[@]}" -eq 1 ]]
manifest="${manifests[0]}"
name="$(basename "${manifest%.sha256}")"
bash "$scripts/restore-cloud-drill.sh" "$name"
printf 'corruption' >> "$fixture/remote/backups/$name"
if bash "$scripts/restore-cloud-drill.sh" "$name"; then
  echo 'Restauração aceitou arquivo corrompido' >&2
  exit 1
fi
echo 'BACKUP_SFTP_DRILL_PASS'
