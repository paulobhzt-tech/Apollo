param(
  [Parameter(Mandatory)]
  [string]$Installer,
  [Parameter(Mandatory)]
  [ValidateSet('production', 'test')]
  [string]$Channel
)

$ErrorActionPreference = 'Stop'
$setup = (Resolve-Path -LiteralPath $Installer).Path
$version = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
$dir = Join-Path $env:RUNNER_TEMP 'ApolloSmoke'
Write-Host "Runner: $([Environment]::OSVersion.VersionString)"
Write-Host "Instalador: $setup"
Write-Host "Destino: $dir"
# NSIS requires /D=path as the LAST argument, with no quoting of the path.
$installerProcess = Start-Process -FilePath $setup -ArgumentList "/S /D=$dir" -PassThru -Wait
Write-Host "NSIS exit code: $($installerProcess.ExitCode)"
if ($installerProcess.ExitCode -ne 0) {
  Write-Host 'Arquivos encontrados apos tentativa de instalacao:'
  Get-ChildItem -Path $dir -Force -ErrorAction SilentlyContinue | Select-Object Name,Length | Format-Table
  $crash = Join-Path $env:RUNNER_TEMP 'apollo-installer-diagnostics.txt'
  "NSIS exit code: $($installerProcess.ExitCode)`nSetup: $setup`nTarget: $dir`nWindows: $([Environment]::OSVersion.VersionString)" | Set-Content $crash
  throw "Instalacao NSIS falhou: $($installerProcess.ExitCode)"
}
$app = Join-Path $dir 'Apollo PDV.exe'
if (-not (Test-Path $app)) { throw "Apollo PDV.exe nao foi instalado" }
$env:PDV_SMOKE = 'offline'
if ($Channel -eq 'production') {
  $env:PDV_SMOKE = 'offline-with-server'
  $configDir = Join-Path $env:APPDATA 'Apollo PDV'
  $config = Join-Path $configDir 'config.json'
  if (Test-Path $config) { throw 'O teste precisa de um perfil Windows sem configuracao Apollo' }
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
  @{
    serverUrl = 'http://localhost:18080'
    testBuild = $true
    startWithWindows = $false
  } | ConvertTo-Json | Set-Content -LiteralPath $config
}
$stdout = Join-Path $env:RUNNER_TEMP 'apollo-smoke-out.txt'
$stderr = Join-Path $env:RUNNER_TEMP 'apollo-smoke-err.txt'
$process = Start-Process -FilePath $app -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
try {
  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Seconds 2
    $process.Refresh()
  } while (-not $process.HasExited -and (Get-Date) -lt $deadline)
  if (-not $process.HasExited) { throw 'Apollo nao encerrou o smoke test em 90 segundos' }
  $output = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
  Write-Host $output
  if ($process.ExitCode -ne 0) { throw "Apollo falhou ao iniciar: $($process.ExitCode)" }
  if ($output -notmatch 'PDV_SMOKE_PASS') { throw 'Apollo nao confirmou tela offline e ponte desktop' }
  if ($Channel -eq 'production' -and $output -notmatch 'PDV_SMOKE_HTTPS_PASS') {
    throw 'Apollo nao confirmou a recuperacao da configuracao antiga e a conexao HTTPS'
  }
  if ($output -notmatch "(?m)^PDV_SMOKE_VERSION $([regex]::Escape($version))\s*$") {
    throw "O aplicativo instalado nao confirmou a versao $version"
  }
  Write-Host "HOMOLOGACAO BASICA WINDOWS APROVADA: $version"
} finally {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'Apollo PDV.exe' -and $_.ExecutablePath -like "$dir*"
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
