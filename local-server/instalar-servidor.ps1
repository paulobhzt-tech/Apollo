# Apollo PDV - instalador do SERVIDOR LOCAL da loja (Windows 10/11)
# Rode como Administrador:  powershell -ExecutionPolicy Bypass -File .\instalar-servidor.ps1
# Instala: Python 3.11, MongoDB Community, o servidor Apollo PDV (porta 8001) como tarefa que inicia com o Windows,
# libera a porta no firewall e serve as telas no mesmo endereço (https://IP-DO-PC:8001).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot          # pasta do projeto (contém backend\ e frontend\)
$Dest = "C:\ApolloPDV"
$Port = 8001

Write-Host "== Apollo PDV - Servidor local ==" -ForegroundColor Cyan

function Need($cmd, $wingetId) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando $wingetId ..."
    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements --silent
  }
}
Need "python" "Python.Python.3.11"
Need "node" "OpenJS.NodeJS.LTS"
if (-not (Get-Service -Name MongoDB -ErrorAction SilentlyContinue)) {
  Write-Host "Instalando MongoDB Community (servico MongoDB) ..."
  winget install --id MongoDB.Server -e --accept-source-agreements --accept-package-agreements --silent
}
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Copiando arquivos para $Dest ..."
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
robocopy "$Root\backend" "$Dest\backend" /E /XD __pycache__ backups tests /XF .env /NFL /NDL /NJH /NJS | Out-Null
New-Item -ItemType Directory -Force -Path "$Dest\security" | Out-Null
Copy-Item "$Root\local-server\gerar-certificado.py" "$Dest\security\gerar-certificado.py" -Force

Write-Host "Gerando as telas (frontend) ..."
Push-Location "$Root\frontend"
npm install -g yarn | Out-Null
yarn install --frozen-lockfile
yarn vite build
Pop-Location
robocopy "$Root\frontend\dist" "$Dest\web" /E /NFL /NDL /NJH /NJS | Out-Null

Write-Host "Instalando dependencias do servidor ..."
python -m venv "$Dest\venv"
& "$Dest\venv\Scripts\python.exe" -m pip install --upgrade pip
& "$Dest\venv\Scripts\python.exe" -m pip install -r "$Dest\backend\requirements.txt" --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Local TLS certificate. Reserve this IP in the router before installation.
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and
  $_.PrefixOrigin -ne "WellKnown"
} | Select-Object -First 1).IPAddress
if (-not $ip) { throw "Nenhum IP local encontrado. Configure a rede antes de instalar." }
& "$Dest\venv\Scripts\python.exe" "$Dest\security\gerar-certificado.py" "$Dest\security" $ip
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel gerar o certificado TLS." }
& icacls "$Dest\security\server.key" /inheritance:r /grant:r "*S-1-5-18:F" "*S-1-5-32-544:F" | Out-Null
& certutil -addstore -f Root "$Dest\security\apollo-local-ca.crt" | Out-Null

$envFile = "$Dest\backend\.env"
if (-not (Test-Path $envFile)) {
  $secret = [Convert]::ToBase64String((1..36 | ForEach-Object { Get-Random -Maximum 256 }))
  @"
MONGO_URL="mongodb://localhost:27017"
DB_NAME="apollo_pdv"
CORS_ORIGINS=""
APP_URL="https://$ip`:$Port"
COOKIE_SECURE="true"
SERVE_FRONTEND_DIR="$Dest\web"
WEBHOOK_CRON_SECRET="$secret"
"@ | Set-Content -Encoding UTF8 $envFile
}

# Upgrade pre-existing local installations without resetting database secrets.
$existing = Get-Content $envFile -Raw
$existing = [regex]::Replace($existing, '(?m)^COOKIE_SECURE=.*
$run = "`"$Dest\venv\Scripts\python.exe`" -m uvicorn server:app --host 0.0.0.0 --port $Port --ssl-certfile `"$Dest\security\server.crt`" --ssl-keyfile `"$Dest\security\server.key`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$Dest\backend`" && $run" -WorkingDirectory "$Dest\backend"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "ApolloPDV-Servidor" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest -Force | Out-Null

# backup local automatico todo dia as 03:00
$bk = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -Command `"`$s=(Get-Content '$envFile' | Select-String 'WEBHOOK_CRON_SECRET').ToString().Split('=')[1].Trim('`"'); Invoke-RestMethod -Method Post -Uri https://localhost:$Port/api/cron/nightly-backup -Headers @{Authorization=('Bearer '+`$s)} -ContentType 'application/json' -Body '{}'`""
Register-ScheduledTask -TaskName "ApolloPDV-Backup" -Action $bk -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) -User "SYSTEM" -Force | Out-Null

New-NetFirewallRule -DisplayName "Apollo PDV $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName "ApolloPDV-Servidor"

Write-Host ""
Write-Host "Pronto! Servidor: https://$ip`:$Port" -ForegroundColor Green
Write-Host "1) Defina este IP como FIXO no roteador."
Write-Host "2) No app Apollo PDV: Configuracoes > Sistema > adicionar servidor $ip`:$Port > Usar."
Write-Host "3) Primeiro acesso: crie o administrador restaurando um backup (Configuracoes > Backup) ou rode criar-admin.ps1."
, 'COOKIE_SECURE="true"')
$existing = [regex]::Replace($existing, '(?m)^APP_URL=.*
$run = "`"$Dest\venv\Scripts\python.exe`" -m uvicorn server:app --host 0.0.0.0 --port $Port"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$Dest\backend`" && $run" -WorkingDirectory "$Dest\backend"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "ApolloPDV-Servidor" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest -Force | Out-Null

# backup local automatico todo dia as 03:00
$bk = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -Command `"`$s=(Get-Content '$envFile' | Select-String 'WEBHOOK_CRON_SECRET').ToString().Split('=')[1].Trim('`"'); Invoke-RestMethod -Method Post -Uri http://localhost:$Port/api/cron/nightly-backup -Headers @{Authorization=('Bearer '+`$s)} -ContentType 'application/json' -Body '{}'`""
Register-ScheduledTask -TaskName "ApolloPDV-Backup" -Action $bk -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) -User "SYSTEM" -Force | Out-Null

New-NetFirewallRule -DisplayName "Apollo PDV $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName "ApolloPDV-Servidor"

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Pronto! Servidor: http://$ip`:$Port" -ForegroundColor Green
Write-Host "1) Defina este IP como FIXO no roteador."
Write-Host "2) No app Apollo PDV: Configuracoes > Sistema > adicionar servidor $ip`:$Port > Usar."
Write-Host "3) Primeiro acesso: crie o administrador restaurando um backup (Configuracoes > Backup) ou rode criar-admin.ps1."
, ('APP_URL="https://' + $ip + ':' + $Port + '"'))
$existing = [regex]::Replace($existing, '(?m)^CORS_ORIGINS=.*
$run = "`"$Dest\venv\Scripts\python.exe`" -m uvicorn server:app --host 0.0.0.0 --port $Port"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$Dest\backend`" && $run" -WorkingDirectory "$Dest\backend"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "ApolloPDV-Servidor" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest -Force | Out-Null

# backup local automatico todo dia as 03:00
$bk = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -Command `"`$s=(Get-Content '$envFile' | Select-String 'WEBHOOK_CRON_SECRET').ToString().Split('=')[1].Trim('`"'); Invoke-RestMethod -Method Post -Uri http://localhost:$Port/api/cron/nightly-backup -Headers @{Authorization=('Bearer '+`$s)} -ContentType 'application/json' -Body '{}'`""
Register-ScheduledTask -TaskName "ApolloPDV-Backup" -Action $bk -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) -User "SYSTEM" -Force | Out-Null

New-NetFirewallRule -DisplayName "Apollo PDV $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName "ApolloPDV-Servidor"

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Pronto! Servidor: http://$ip`:$Port" -ForegroundColor Green
Write-Host "1) Defina este IP como FIXO no roteador."
Write-Host "2) No app Apollo PDV: Configuracoes > Sistema > adicionar servidor $ip`:$Port > Usar."
Write-Host "3) Primeiro acesso: crie o administrador restaurando um backup (Configuracoes > Backup) ou rode criar-admin.ps1."
, 'CORS_ORIGINS=""')
$existing | Set-Content -Encoding UTF8 $envFile

# inicia com o Windows (mesmo sem ninguem logado)
$run = "`"$Dest\venv\Scripts\python.exe`" -m uvicorn server:app --host 0.0.0.0 --port $Port"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$Dest\backend`" && $run" -WorkingDirectory "$Dest\backend"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "ApolloPDV-Servidor" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest -Force | Out-Null

# backup local automatico todo dia as 03:00
$bk = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -Command `"`$s=(Get-Content '$envFile' | Select-String 'WEBHOOK_CRON_SECRET').ToString().Split('=')[1].Trim('`"'); Invoke-RestMethod -Method Post -Uri http://localhost:$Port/api/cron/nightly-backup -Headers @{Authorization=('Bearer '+`$s)} -ContentType 'application/json' -Body '{}'`""
Register-ScheduledTask -TaskName "ApolloPDV-Backup" -Action $bk -Trigger (New-ScheduledTaskTrigger -Daily -At 3am) -User "SYSTEM" -Force | Out-Null

New-NetFirewallRule -DisplayName "Apollo PDV $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName "ApolloPDV-Servidor"

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Pronto! Servidor: http://$ip`:$Port" -ForegroundColor Green
Write-Host "1) Defina este IP como FIXO no roteador."
Write-Host "2) No app Apollo PDV: Configuracoes > Sistema > adicionar servidor $ip`:$Port > Usar."
Write-Host "3) Primeiro acesso: crie o administrador restaurando um backup (Configuracoes > Backup) ou rode criar-admin.ps1."

Write-Host "4) Nos celulares e demais PCs, importe o certificado PUBLICO C:\ApolloPDV\security\apollo-local-ca.crt como autoridade confiavel."
Write-Host "5) Nunca compartilhe a chave privada server.key. Reserve o IP no roteador."
