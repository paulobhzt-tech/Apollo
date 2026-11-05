"""Read-only checks for Apollo's single-restaurant VPS deployment.

Does not print the contents of .env or run Docker changes.
Usage: python3 -m management.vps_preflight
"""
import argparse
from pathlib import Path
import re
import subprocess

DEFAULT_ROOT = Path("/opt/apollo")
REQUIRED_KEYS = ("APOLLO_DOMAIN", "MONGO_USER", "MONGO_PASSWORD", "MONGO_URL", "WEBHOOK_CRON_SECRET")


def read_env_file(path):
    result = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def inspect_configuration(root):
    """Return only non-secret issues; do not expose credentials in output."""
    issues = []
    env_path = Path(root) / "deploy" / "vps" / ".env"
    if not env_path.exists():
        return ["Arquivo privado .env ausente"]
    if env_path.stat().st_mode & 0o077:
        issues.append("Permissoes do .env muito abertas; use chmod 600")
    conf = read_env_file(env_path)
    for key in REQUIRED_KEYS:
        if not conf.get(key):
            issues.append("Configuracao obrigatoria ausente: " + key)
    if "SUBSTITUA" in " ".join(conf.values()):
        issues.append("Ainda existem valores de exemplo no .env")
    domain = conf.get("APOLLO_DOMAIN", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,63}", domain) or domain.endswith(".invalid"):
        issues.append("Dominio real ainda nao configurado (HTTPS e Windows pendentes)")
    return issues


def run_check(command, cwd=None):
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=20, check=False)
        return result.returncode == 0, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return False, ""


def main():
    parser = argparse.ArgumentParser(description="Diagnostico seguro e sem alteracoes da VPS Apollo")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    issues = inspect_configuration(root)
    compose_dir = root / "deploy" / "vps"
    print("Apollo PDV — diagnostico da VPS (somente leitura)")
    for label, command in (
        ("Docker ativo", ["systemctl", "is-active", "--quiet", "docker"]),
        ("Docker Compose", ["docker", "compose", "version"]),
        ("MongoDB e Apollo (containers)", ["docker", "compose", "ps", "--status", "running", "--services"]),
        ("Validacao do Compose", ["docker", "compose", "config", "--quiet"]),
    ):
        ok, stdout = run_check(command, cwd=compose_dir)
        if label.startswith("MongoDB") and ok:
            services = set(stdout.splitlines())
            ok = {"mongo", "apollo"}.issubset(services)
        print(("[OK] " if ok else "[PENDENTE] ") + label)
    for issue in issues:
        print("[PENDENTE] " + issue)
    if not issues:
        print("[OK] Configuracao privada presente e com dominio configurado")
    print("Nao envie senhas, arquivos .env nem tokens de pagamento.")


if __name__ == "__main__":
    main()
