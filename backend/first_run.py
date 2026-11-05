"""Provision a blank Apollo installation from a trusted server terminal.

Usage: docker compose exec apollo python first_run.py
Never expose this operation through unauthenticated HTTP endpoints.
"""
import asyncio
import getpass
import sys

from lib.auth import pin_in_use, secure_hash_pin
from lib.db import db
from models.schemas import Employee


async def first_run() -> int:
    if await db.employees.count_documents({}) > 0:
        print("Já existem funcionários cadastrados. Cadastro inicial bloqueado.")
        return 1
    name = input("Nome do administrador: ").strip()
    if len(name) < 2 or len(name) > 100:
        print("Nome inválido.", file=sys.stderr)
        return 1
    pin = getpass.getpass("PIN exclusivo de 4 a 6 números: ")
    if not pin.isascii() or not pin.isdecimal() or not (4 <= len(pin) <= 6):
        print("PIN inválido.", file=sys.stderr)
        return 1
    repeat = getpass.getpass("Confirme o PIN: ")
    if pin != repeat:
        print("PINs diferentes.", file=sys.stderr)
        return 1
    if await pin_in_use(pin):
        print("PIN já utilizado.", file=sys.stderr)
        return 1
    emp = Employee(name=name, role="admin", can_cancel=True).model_dump()
    # Atomic insert of one administrator only. DB user must be private to this installation.
    await db.employees.insert_one({**emp, "pin_hash": secure_hash_pin(pin)})
    print("Administrador inicial criado. Configure os dados da empresa em Configurações.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(first_run()))
