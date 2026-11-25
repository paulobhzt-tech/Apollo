#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][switch]$Teste,
    [Parameter(Mandatory=$true)][string]$Impressora,
    [ValidateRange(1,5)][int]$Vias = 2,
    [Guid]$JobId = [Guid]::NewGuid()
)
$ErrorActionPreference = 'Stop'
if (-not $Teste) { throw 'Somente homologacao local nesta versao.' }
Add-Type -AssemblyName System.Drawing
$settings = New-Object System.Drawing.Printing.PrinterSettings
$settings.PrinterName = $Impressora
if (-not $settings.IsValid) { throw 'Fila Windows invalida.' }

# A local journal remains on disk even if the process is interrupted.
# A started copy without an accepted marker must never be retried automatically.
$root = Join-Path $env:LOCALAPPDATA 'ApolloPrintLite-Homologacao'
[void][System.IO.Directory]::CreateDirectory($root)
function Write-Marker([string]$Path, [string]$Value) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

# One local worker at a time. No modification of Windows printer preferences.
$lock = [System.IO.File]::Open((Join-Path $root 'worker.lock'),
    [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None)
try {
    $id = $JobId.ToString('N')
    $prefix = Join-Path $root $id
    Write-Host "Job de homologacao: $id"
    if (@(Get-ChildItem -LiteralPath $root -Filter "$id-*.state").Count -gt 0) {
        throw 'Job ja iniciado. Confira papel e registros; nao ha reenvio automatico.'
    }
    for ($via = 1; $via -le $Vias; $via++) {
        $lines = @(
            'ESPETERIA CHURRAS BURGUER'
            'APOLLO PRINT LITE - TESTE'
            '------------------------------'
            "VIA $via DE $Vias"
            'MESA 05 - HOMOLOGACAO'
            ('2x Espetinho de cora' + [char]0x00E7 + [char]0x00E3 + 'o')
            ('1x Por' + [char]0x00E7 + [char]0x00E3 + 'o de mandioca')
            '4x Chopp Brahma'
            '------------------------------'
            'SEM VALOR COMERCIAL'
            'FIM DO TESTE'
        )
        $doc = New-Object System.Drawing.Printing.PrintDocument
        $font = New-Object System.Drawing.Font('Courier New',9)
        try {
            $doc.PrinterSettings.PrinterName = $Impressora
            $doc.PrinterSettings.Copies = 1
            $doc.DocumentName = "Apollo Teste $id via $via"
            $height = [int][Math]::Max(394, ($lines.Count * 18 + 40))
            $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Apollo 80mm',315,$height)
            $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(10,10,5,5)
            $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
            $doc.add_PrintPage({
                param($sender,$e)
                $y = 5
                foreach ($line in $lines) {
                    $e.Graphics.DrawString($line,$font,[System.Drawing.Brushes]::Black,10,$y)
                    $y += 18
                }
                $e.HasMorePages = $false
            })
            Write-Marker "$prefix-$via-started.state" ([DateTime]::UtcNow.ToString('o'))
            $doc.Print()
            Write-Marker "$prefix-$via-accepted.state" ([DateTime]::UtcNow.ToString('o'))
            Write-Host "Via $via enviada ao Windows; confira a saida no papel."
        } catch {
            Write-Warning "Via ${via}: interrompido. Confira papel e registros antes de novo teste."
            throw
        } finally {
            $doc.Dispose()
            $font.Dispose()
        }
        if ($via -lt $Vias) { Start-Sleep -Seconds 1 }
    }
    Write-Host "Registros locais: $root"
} finally { $lock.Dispose() }
