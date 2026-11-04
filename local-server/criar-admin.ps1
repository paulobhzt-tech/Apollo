# Cria o primeiro administrador no servidor local (rode como Administrador no PC do servidor).
# Uso: powershell -ExecutionPolicy Bypass -File .\criar-admin.ps1 -Nome "Paulo" -Pin 1234
param([Parameter(Mandatory = $true)][string]$Nome, [Parameter(Mandatory = $true)][string]$Pin)
$Dest = "C:\ApolloPDV"
Push-Location "$Dest\backend"
& "$Dest\venv\Scripts\python.exe" -c @"
import asyncio, sys
from lib.db import db
from lib.auth import hash_pin
from models.schemas import Employee
async def m():
    e = Employee(name=sys.argv[1], role='admin', can_cancel=True).model_dump()
    await db.employees.insert_one({**e, 'pin_hash': hash_pin(sys.argv[2])})
    print('Administrador criado:', sys.argv[1])
asyncio.run(m())
"@ $Nome $Pin
Pop-Location
