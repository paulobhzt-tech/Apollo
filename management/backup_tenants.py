"""Per-restaurant MongoDB backup for Apollo SaaS.

Runs on the VPS/operator machine; never as an unauthenticated API.
Uses a tenant's private Docker Compose MongoDB container. Does not expose
database ports or print credentials. Copy verified archives off-server.
"""
import argparse
from datetime import datetime, timezone
import gzip
import os
from pathlib import Path
import re
import subprocess

SLUG_RE = re.compile(r"^[a-z][a-z0-9-]{1,38}[a-z0-9]$")


def tenant_directory(base: Path, slug: str) -> Path:
    if not SLUG_RE.fullmatch(slug):
        raise ValueError("Identificador de cliente invalido")
    tenant = base.expanduser().resolve() / "tenants" / slug
    if not (tenant / "compose.yaml").is_file() or not (tenant / ".env").is_file():
        raise ValueError("Restaurante nao configurado")
    return tenant


def backup(base: Path, slug: str, destination: Path, *, command=subprocess.run, now=None, keep_days=7) -> Path:
    """Create verified archive; remove old archives only after a success."""
    if not 1 <= keep_days <= 365:
        raise ValueError("Retencao deve estar entre 1 e 365 dias")
    tenant = tenant_directory(base, slug)
    target_dir = destination.expanduser().resolve() / slug
    target_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(target_dir, 0o700)
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    archive = target_dir / f"apollo-{slug}-{stamp}.archive.gz"
    partial = target_dir / (archive.name + ".partial")
    if archive.exists() or partial.exists():
        raise FileExistsError("Backup deste horario ja existe; nao sobrescrever")
    cmd = [
        "docker", "compose", "--env-file", ".env", "exec", "-T", "mongo", "sh", "-c",
        'exec mongodump --authenticationDatabase admin '
        '--username "$MONGO_INITDB_ROOT_USERNAME" '
        '--password "$MONGO_INITDB_ROOT_PASSWORD" '
        '--db apollo_pdv --archive --gzip'
    ]
    try:
        with partial.open("xb") as output:
            os.chmod(partial, 0o600)
            command(cmd, cwd=tenant, stdout=output, check=True)
        with gzip.open(partial, "rb") as stream:
            total = 0
            while chunk := stream.read(1024 * 1024):
                total += len(chunk)
        if total < 100:
            raise RuntimeError("Backup vazio ou incompleto")
        partial.rename(archive)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    cutoff = datetime.now(timezone.utc).timestamp() - keep_days * 86400
    for candidate in target_dir.glob(f"apollo-{slug}-*.archive.gz"):
        if candidate != archive and candidate.is_file() and candidate.stat().st_mtime < cutoff:
            candidate.unlink()
    return archive


def verify(archive: Path) -> int:
    """Confirm gzip integrity; does NOT restore into MongoDB."""
    size = 0
    with gzip.open(archive, "rb") as stream:
        while block := stream.read(1024 * 1024):
            size += len(block)
    if size < 100:
        raise ValueError("Arquivo muito pequeno ou vazio")
    return size


def main():
    parser = argparse.ArgumentParser(description="Apollo SaaS: backup por restaurante")
    parser.add_argument("--base", type=Path, default=Path("/opt/apollo-saas"))
    parser.add_argument("--destination", type=Path, default=Path("/var/backups/apollo-saas"))
    sub = parser.add_subparsers(dest="operation", required=True)
    run = sub.add_parser("backup")
    run.add_argument("--tenant", required=True)
    run.add_argument("--keep-days", type=int, default=7)
    check = sub.add_parser("verify")
    check.add_argument("archive", type=Path)
    args = parser.parse_args()
    if args.operation == "backup":
        out = backup(args.base, args.tenant, args.destination, keep_days=args.keep_days)
        print("Backup verificado por gzip:", out)
        print("ATENCAO: copie criptografado para fora da VPS e teste restauracao isolada.")
    else:
        size = verify(args.archive)
        print(f"Gzip integro ({size} bytes descompactados). Teste de restauracao ainda necessario.")


if __name__ == "__main__":
    main()
