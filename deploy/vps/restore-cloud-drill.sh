#!/usr/bin/env bash
# Download a verified cloud archive and restore it only to a disposable container.
set -euo pipefail
umask 077
: "${APOLLO_BACKUP_REMOTE:?Informe o remoto rclone}"
: "${APOLLO_BACKUP_IDENTITY:?Informe a chave privada age de recuperação}"
: "${RCLONE_CONFIG:?Informe a configuração privada do rclone}"
name="${1:-}"
[[ "$name" =~ ^apollo-[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]{8}\.archive\.gz\.age$ ]] || {
  echo "Uso: $0 nome-do-backup.archive.gz.age" >&2
  exit 2
}
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
destination="${APOLLO_BACKUP_REMOTE%/}/$name"
rclone copyto --retries 3 "$destination.sha256" "$work/$name.sha256"
rclone copyto --retries 3 "$destination" "$work/$name"
expected="$(cat "$work/$name.sha256")"
actual="$(cd "$work" && sha256sum "$name")"
[[ "$actual" == "$expected" ]] || { echo 'SHA-256 remoto divergente' >&2; exit 1; }

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
archive="${name%.age}"
cd "$work"
age --decrypt --identity "$APOLLO_BACKUP_IDENTITY" --output "$archive" "$name"
sha256sum "$archive" > "$archive.sha256"
bash "$script_dir/restore-drill.sh" "$work/$archive"
