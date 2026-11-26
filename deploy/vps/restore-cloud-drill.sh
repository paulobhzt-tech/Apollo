#!/usr/bin/env bash
# Download a verified cloud archive and restore it only to a disposable container.
set -euo pipefail
umask 077
started=$SECONDS
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
duration=$((SECONDS - started))
printf 'RESTORE_CLOUD_VERIFIED: %s em %s s\n' "$name" "$duration"
if [[ -n "${APOLLO_RESTORE_STATUS_DIR:-}" ]]; then
  python3 - "$APOLLO_RESTORE_STATUS_DIR" "$name" "$duration" "$actual" <<'PYTHON'
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

directory, archive, seconds, checksum = sys.argv[1:]
directory = Path(directory).resolve(strict=True)
with NamedTemporaryFile("w", dir=directory, delete=False) as handle:
    temporary = Path(handle.name)
    try:
        json.dump({"at": datetime.now(timezone.utc).isoformat(), "name": archive,
                   "duration_seconds": int(seconds), "sha256": checksum.split()[0]}, handle)
        handle.close()
        os.replace(temporary, directory / "restore.json")
    finally:
        temporary.unlink(missing_ok=True)
PYTHON
fi
