# Execute no computador servidor, em um PowerShell interativo.
param(
    [switch]$Listar,
    [string]$Recuperar
)

$ErrorActionPreference = "Stop"
if ($Listar -and $Recuperar) {
    throw "Escolha apenas -Listar ou -Recuperar."
}

$Dest = "C:\ApolloPDV"
$Python = Join-Path $Dest "venv\Scripts\python.exe"
$Script = Join-Path $Dest "backend\first_run.py"
if (-not (Test-Path -LiteralPath $Python) -or -not (Test-Path -LiteralPath $Script)) {
    throw "O servidor Apollo atualizado precisa estar instalado em $Dest."
}

$Options = @()
if ($Listar) { $Options += "--list-admins" }
if ($Recuperar) { $Options += @("--recover", $Recuperar) }

Push-Location (Join-Path $Dest "backend")
try {
    & $Python $Script @Options
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
