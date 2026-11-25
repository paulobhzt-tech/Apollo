#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Saida = (Join-Path (Get-Location) ('apollo-impressoras-{0}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
)

$ErrorActionPreference = 'Stop'
$avisos = [System.Collections.Generic.List[string]]::new()

function Read-Inventory {
    param([string]$Nome, [scriptblock]$Consulta)
    try {
        & $Consulta
    } catch {
        $avisos.Add(('{0}: {1}' -f $Nome, $_.Exception.Message))
    }
}

$filas = @(Read-Inventory 'Filas' {
    Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Shared, ShareName, Type
})
$portas = @(Read-Inventory 'Portas' {
    Get-PrinterPort | Select-Object Name, PrinterHostAddress, PortNumber
})
$dispositivos = @(Read-Inventory 'Dispositivos' {
    Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus, DriverName, PortName, Capabilities
})
$drivers = @(Read-Inventory 'Drivers' {
    Get-PrinterDriver | Select-Object Name, Manufacturer, PrinterEnvironment
})
$spooler = Read-Inventory 'Spooler' { (Get-Service -Name Spooler).Status.ToString() }

$relatorio = [ordered]@{
    schema = 'apollo-printer-inventory-v1'
    coletadoEm = [DateTime]::UtcNow.ToString('o')
    spooler = $spooler
    filas = $filas
    portas = $portas
    dispositivos = $dispositivos
    drivers = $drivers
    avisos = $avisos.ToArray()
}

$caminho = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Saida)
# CreateNew protects any previous inventory against accidental overwrite.
$arquivo = [System.IO.File]::Open($caminho, [System.IO.FileMode]::CreateNew)
try {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $bytes = $utf8.GetBytes(($relatorio | ConvertTo-Json -Depth 5))
    $arquivo.Write($bytes, 0, $bytes.Length)
} finally {
    $arquivo.Dispose()
}

Write-Output "Inventário salvo em $caminho"
if ($avisos.Count) {
    Write-Warning 'Algumas consultas falharam. Consulte o campo avisos no relatório.'
}
