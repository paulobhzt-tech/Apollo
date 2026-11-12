"""Provision or recover an administrator from the trusted Apollo server terminal."""
import argparse
import asyncio
import getpass
import sys

from lib.admin_access import provision_first_admin, recover_admin_password
from lib.auth import pin_in_use, secure_hash_pin
from lib.db import db


def secret(prompt: str) -> str:
    value = getpass.getpass(prompt)
    if getpass.getpass("Confirme: ") != value:
        raise ValueError("As duas entradas precisam ser iguais.")
    return value


async def first_run(recover: str | None) -> None:
    if recover is not None:
        employee = await db.employees.find_one({"id": recover, "role": "admin", "active": True})
        if not employee:
            raise ValueError("Administrador ativo não encontrado para esse ID.")
        print(f"Conta selecionada: {employee['name']}")
        username = employee.get("username") or input("Novo usuário para a conta existente: ")
        await recover_admin_password(db, employee, username, secret("Nova senha: "))
        print("Senha atualizada. Entre novamente com o usuário e a nova senha.")
        return

    if await db.employees.find_one({"role": "admin"}, {"_id": 1}):
        raise ValueError("Já existe administrador cadastrado. Use --list-admins para localizar a conta.")
    name = input("Nome do administrador: ").strip()
    if not 2 <= len(name) <= 100:
        raise ValueError("Nome inválido.")
    username = input("Usuário do administrador: ")
    password = secret("Senha inicial: ")
    pin = secret("PIN exclusivo de 4 a 6 dígitos (vazio para usar apenas senha): ")
    if pin and (not pin.isascii() or not pin.isdecimal() or not 4 <= len(pin) <= 6 or await pin_in_use(pin)):
        raise ValueError("PIN inválido ou já utilizado.")
    await provision_first_admin(db, name, username, password, secure_hash_pin(pin) if pin else None)
    print("Administrador inicial criado. Entre com as credenciais escolhidas.")


async def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--list-admins", action="store_true")
    actions.add_argument("--recover", metavar="ID")
    args = parser.parse_args()
    if args.list_admins:
        async for employee in db.employees.find(
            {"role": "admin"}, {"_id": 0, "id": 1, "name": 1, "username": 1, "active": 1}
        ):
            username = employee.get("username") or "sem usuário de senha"
            status = "ativo" if employee.get("active") else "inativo"
            print(f"{employee['id']}  {employee['name']}  {username}  {status}")
        return
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise ValueError("Abra um terminal interativo no servidor para inserir credenciais com segurança.")
    await first_run(args.recover)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except ValueError as error:
        sys.exit(str(error))
