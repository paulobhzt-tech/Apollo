# Apollo PDV - backup ampliado para homologacao.
# Executar somente depois que o processo Electron Apollo tiver terminado.
param(
  [string]$Source = (Join-Path $env:APPDATA 'Apollo PDV'),
  [string]$DestinationRoot = 'G:\Meu Drive\backup churras'
)
$ErrorActionPreference = 'Stop'
$items = @('pdv-dados.bin','pdv-dados.bin.bak','config.json','Local Storage','Session Storage')
if (-not (Test-Path -LiteralPath $Source -PathType Container)) { throw 'Pasta de dados do Apollo nao encontrada' }
if (-not (Test-Path -LiteralPath $DestinationRoot -PathType Container)) { throw 'Google Drive indisponivel' }
# Evita copia inconsistente de LevelDB em uso; nao encerra nenhum processo.
$running = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^Apollo' -or ($_.ExecutablePath -and $_.ExecutablePath -match '[\\/]Apollo')
})
if ($running.Count -gt 0) { throw 'Apollo ainda em execucao: backup ampliado cancelado' }
foreach ($item in $items) {
  if (-not (Test-Path -LiteralPath (Join-Path $Source $item))) { throw "Item ausente: $item" }
}
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss-fff'
$folder = 'Apollo-Backup-Ao-Sair-' + $stamp + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$staging = Join-Path $DestinationRoot ($folder + '.incompleto')
$final = Join-Path $DestinationRoot $folder
New-Item -ItemType Directory -Path $staging -ErrorAction Stop | Out-Null
try {
  foreach ($item in $items) {
    Copy-Item -LiteralPath (Join-Path $Source $item) -Destination (Join-Path $staging $item) -Recurse -ErrorAction Stop
  }
  $records = @()
  foreach ($item in $items) {
    $p = Join-Path $Source $item
    $sourceFiles = if (Test-Path -LiteralPath $p -PathType Container) {
      @(Get-ChildItem -LiteralPath $p -File -Recurse -Force -ErrorAction Stop)
    } else { @(Get-Item -LiteralPath $p -ErrorAction Stop) }
    foreach ($f in $sourceFiles) {
      $relative = $f.FullName.Substring($Source.TrimEnd('\\').Length + 1)
      $copy = Join-Path $staging $relative
      $a = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
      $b = (Get-FileHash -LiteralPath $copy -Algorithm SHA256 -ErrorAction Stop).Hash
      if ($a -ne $b) { throw "Falha SHA256: $relative" }
      $records += [pscustomobject]@{File=$relative; SHA256=$a; Bytes=$f.Length}
    }
  }
  $records | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $staging 'manifesto-sha256.json') -Encoding UTF8 -ErrorAction Stop
  Move-Item -LiteralPath $staging -Destination $final -ErrorAction Stop
  Write-Output "BACKUP VERIFICADO: $final"
  Write-Output 'SINCRONIZACAO NA NUVEM: verificar no site do Google Drive'
} catch {
  Write-Error ("Backup incompleto preservado em: " + $staging + " - " + $_.Exception.Message)
  throw
}
