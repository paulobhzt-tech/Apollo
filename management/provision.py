"""Generate isolated Apollo PDV tenants for a single VPS.

Explicit opt-in to start containers via --apply. No internet-facing admin API.
Each tenant has its own private MongoDB container, persistent volume and secrets.
Central Caddy serves HTTPS with one hostname per tenant.
"""
import argparse
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import os
from urllib.parse import quote

SLUG = re.compile(r"^[a-z][a-z0-9-]{1,38}[a-z0-9]$")
DOMAIN = re.compile(r"^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
EDGE = "apollo_edge"


def validate(slug, domain):
    if not SLUG.fullmatch(slug):
        raise ValueError("Identificador invalido: use 3-40 letras minusculas, numeros e hifen")
    if not DOMAIN.fullmatch(domain) or ".." in domain:
        raise ValueError("Dominio invalido: use dominio DNS publico, ex. restaurante.seudominio.com.br")
    return slug, domain


def generate(slug, domain, base: Path, *, project="apollo"):
    """Create tenant files atomically and return tenant directory.

    No Docker commands, DNS changes or billing side-effects at this stage.
    """
    validate(slug, domain)
    base = base.expanduser().resolve()
    tenants = base / "tenants"
    site_dir = base / "gateway" / "sites"
    target = tenants / slug
    site = site_dir / (slug + ".caddy")
    if target.exists() or site.exists():
        raise FileExistsError("Cliente ja cadastrado; nada foi substituido")
    if site_dir.exists():
        for existing in site_dir.glob("*.caddy"):
            if existing.read_text(encoding="utf-8").splitlines()[0].strip() == f"{domain} {{":
                raise ValueError("Dominio ja pertence a outro cliente")
    tenants.mkdir(parents=True, exist_ok=True)
    site_dir.mkdir(parents=True, exist_ok=True)
    tmp = tenants / ("." + slug + "-" + secrets.token_hex(6))
    tmp.mkdir(mode=0o700)
    user = "tenantadmin"
    password = secrets.token_urlsafe(36)
    secret = secrets.token_urlsafe(48)
    # Compose interpolation requires escaping $ if introduced in future credentials.
    env = (
        f"APOLLO_DOMAIN={domain}\\n"
        f"MONGO_USER={user}\\n"
        f"MONGO_PASSWORD={password}\\n"
        f"MONGO_URL=mongodb://{quote(user, safe='')}:{quote(password, safe='')}@mongo:27017/apollo_pdv?authSource=admin\\n"
        f"WEBHOOK_CRON_SECRET={secret}\\n"
    ).replace("\\n", "\n")
    compose = f"""name: apollo-{slug}
services:
  mongo:
    image: mongo:7.0
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${{MONGO_USER:?MONGO_USER ausente}}
      MONGO_INITDB_ROOT_PASSWORD: \${{MONGO_PASSWORD:?MONGO_PASSWORD ausente}}
    volumes:
      - mongo_data:/data/db
    networks: [private]
    security_opt: [no-new-privileges:true]
  apollo:
    image: apollo-pdv:latest
    container_name: apollo_app_{slug.replace("-", "_")}
    restart: unless-stopped
    depends_on: [mongo]
    environment:
      MONGO_URL: \${{MONGO_URL:?MONGO_URL ausente}}
      DB_NAME: apollo_pdv
      APP_URL: https://{domain}
      COOKIE_SECURE: "true"
      CORS_ORIGINS: ""
      WEBHOOK_CRON_SECRET: \${{WEBHOOK_CRON_SECRET:?WEBHOOK_CRON_SECRET ausente}}
      SERVE_FRONTEND_DIR: /app/web
    networks: [private, edge]
    security_opt: [no-new-privileges:true]
networks:
  private:
  edge:
    external: true
    name: {EDGE}
volumes:
  mongo_data:
"""
    # The backslash escaping above protects JS template literal interpolation,
    # not Python output; ensure a literal Compose interpolation placeholder.
    compose = compose.replace("\\${", "${")
    caddy = f"""{domain} {{
    encode zstd gzip
    reverse_proxy apollo_app_{slug.replace("-", "_")}:10000
    header {{
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options DENY
        -Server
    }}
}}
"""
    try:
        (tmp / ".env").write_text(env, encoding="utf-8")
        os.chmod(tmp / ".env", 0o600)
        (tmp / "compose.yaml").write_text(compose, encoding="utf-8")
        os.chmod(tmp, 0o700)
        tmp.rename(target)
        # No surprise overwrites if another provisioning process wrote same path.
        with site.open("x", encoding="utf-8") as f:
            f.write(caddy)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        if target.exists() and not site.exists():
            shutil.rmtree(target, ignore_errors=True)
        raise
    return target


def activate(slug, base: Path, *, command=subprocess.run):
    """Start one tenant and reload central gateway; requires an initialized gateway."""
    tenant_dir = base.expanduser().resolve() / "tenants" / slug
    gateway_dir = base.expanduser().resolve() / "gateway"
    if not (tenant_dir / ".env").is_file() or not (gateway_dir / "compose.yaml").is_file():
        raise RuntimeError("Ambiente ou gateway nao configurado")
    command(["docker", "compose", "--env-file", ".env", "config", "--quiet"], cwd=tenant_dir, check=True)
    command(["docker", "compose", "--env-file", ".env", "up", "-d"], cwd=tenant_dir, check=True)
    command(["docker", "compose", "exec", "-T", "caddy", "caddy", "reload",
             "--config", "/etc/caddy/Caddyfile"], cwd=gateway_dir, check=True)


def main():
    p = argparse.ArgumentParser(description="Apollo SaaS: provisionamento isolado por cliente")
    p.add_argument("--base", type=Path, default=Path("/opt/apollo-saas"))
    sub = p.add_subparsers(dest="command", required=True)
    new = sub.add_parser("create")
    new.add_argument("--slug", required=True)
    new.add_argument("--domain", required=True)
    new.add_argument("--apply", action="store_true", help="Subir containers e recarregar Caddy")
    args = p.parse_args()
    if args.command == "create":
        path = generate(args.slug, args.domain.lower(), args.base)
        print("Arquivos do cliente criados:", path)
        print("Configure DNS A antes de ativar. Nunca compartilhe o arquivo .env.")
        if args.apply:
            activate(args.slug, args.base)
            print("Instancia iniciada. Crie o primeiro administrador usando Docker Compose.")


if __name__ == "__main__":
    main()
