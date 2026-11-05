"""Configure the local Apollo VPS template without printing passwords."""
from pathlib import Path
from secrets import token_hex
import os
import tempfile

def main():
    config = Path("/opt/apollo/deploy/vps/.env")
    if not config.is_file() or config.is_symlink():
        raise SystemExit("Arquivo .env nao encontrado; nada alterado.")
    source = config.read_text()
    placeholder = "SUBSTITUA_POR_SENHA_FORTE"
    secret_placeholder = "SUBSTITUA_POR_SEGREDO_ALEATORIO"
    if source.count(placeholder) != 2 or source.count(secret_placeholder) != 1:
        raise SystemExit("Arquivo .env alterado ou ja configurado; nada foi sobrescrito.")
    password = token_hex(24)
    secret = token_hex(32)
    updated = source.replace(placeholder, password).replace(secret_placeholder, secret)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=config.parent, prefix=".env.tmp-", delete=False) as stream:
            temporary = Path(stream.name)
            os.fchmod(stream.fileno(), 0o600)
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, config)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    print("Credenciais seguras configuradas; senhas nao exibidas.")

if __name__ == "__main__":
    main()
