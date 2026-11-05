"""Prepare an isolated, initially UNPUBLISHED restaurant demo.

No DNS changes, Docker changes or publicly accessible route are made.
The demo route remains .disabled until the operator adds gateway authentication.
"""
import argparse
from pathlib import Path
import re

from .provision import SLUG, generate

BCRYPT_HASH = re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")


def prepare_demo(base: Path, slug: str, domain: str) -> Path:
    if not SLUG.fullmatch(slug) or not slug.startswith("demo-"):
        raise ValueError("Demonstrações precisam de slug iniciado por demo-")
    tenant = generate(slug, domain, base)
    compose_path = tenant / "compose.yaml"
    original = compose_path.read_text(encoding="utf-8")
    updated = original.replace("DB_NAME: apollo_pdv", f"DB_NAME: apollo_demo_{slug.replace('-', '_')}\n      APOLLO_DEMO_MODE: \"true\"")
    if original == updated:
        raise RuntimeError("Falha ao configurar banco da demonstração")
    compose_path.write_text(updated, encoding="utf-8")
    active = base.expanduser().resolve() / "gateway" / "sites" / f"{slug}.caddy"
    active.rename(active.with_suffix(".disabled"))
    return tenant


def enable_demo_gateway(base: Path, slug: str, bcrypt_hash: str) -> Path:
    if not slug.startswith("demo-"):
        raise ValueError("Identificador de demonstração inválido")
    if not BCRYPT_HASH.fullmatch(bcrypt_hash):
        raise ValueError("Forneça hash bcrypt válido criado pelo Caddy (não a senha)")
    directory = base.expanduser().resolve() / "gateway" / "sites"
    disabled = directory / f"{slug}.disabled"
    active = directory / f"{slug}.caddy"
    if not disabled.is_file() or active.exists():
        raise FileNotFoundError("Configuração desativada não encontrada ou já publicada")
    content = disabled.read_text(encoding="utf-8")
    if "reverse_proxy" not in content:
        raise ValueError("Configuração de gateway inesperada")
    # Authentication is required before any reverse proxy is enabled.
    content = content.replace("    reverse_proxy", f"    basic_auth {{\n        visitante {bcrypt_hash}\n    }}\n    reverse_proxy", 1)
    active.write_text(content, encoding="utf-8")
    disabled.unlink()
    return active


def main():
    parser = argparse.ArgumentParser(description="Apollo: demonstração comercial isolada")
    parser.add_argument("--base", type=Path, default=Path("/opt/apollo-saas"))
    sub = parser.add_subparsers(dest="operation", required=True)
    create = sub.add_parser("prepare")
    create.add_argument("--slug", default="demo-apollo")
    create.add_argument("--domain", required=True)
    enable = sub.add_parser("enable")
    enable.add_argument("--slug", default="demo-apollo")
    enable.add_argument("--bcrypt-hash", required=True, help="Hash Caddy bcrypt, nunca uma senha simples")
    args = parser.parse_args()
    if args.operation == "prepare":
        tenant = prepare_demo(args.base, args.slug, args.domain.lower())
        print("Demonstração preparada, NÃO publicada:", tenant)
        print("Faça deploy, gere dados de teste, crie proteção HTTP antes de habilitar.")
    else:
        out = enable_demo_gateway(args.base, args.slug, args.bcrypt_hash)
        print("Configuração autenticada criada:", out)
        print("Revise e execute manualmente o reload do gateway Caddy.")


if __name__ == "__main__":
    main()
