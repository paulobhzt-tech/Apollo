#requires -Version 5.1
[CmdletBinding(DefaultParameterSetName='Run')]
param(
    [Parameter(Mandatory, ParameterSetName='Pair')][uri]$Server,
    [Parameter(Mandatory, ParameterSetName='Pair')][string]$Queue,
    [Parameter(Mandatory, ParameterSetName='Pair')][switch]$Pair
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'ApolloPrintAgent'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$gate = [IO.File]::Open((Join-Path $root 'worker.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$configPath = Join-Path $root 'terminal.json'
$pendingPath = Join-Path $root 'pending.json'

function Write-State($path, $data) {
    $temp = "$path.tmp"
    $bytes = [Text.Encoding]::UTF8.GetBytes(($data | ConvertTo-Json -Compress -Depth 6))
    $stream = [IO.File]::Open($temp, 'Create', 'Write', 'None')
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp, $path, $null) }
    else { [IO.File]::Move($temp, $path) }
}

function Assert-Origin([uri]$origin) {
    if (!$origin.IsAbsoluteUri -or $origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/' -or
        $origin.UserInfo -or $origin.Query -or $origin.Fragment) {
        throw 'Informe a origem HTTPS autorizada do Apollo.'
    }
}

try {
    Add-Type -AssemblyName System.Drawing
    if ($Pair) {
        Assert-Origin $Server
        if ((Test-Path $configPath) -or (Test-Path $pendingPath)) {
            throw 'Terminal já configurado. Revogue o vínculo e confira o trabalho pendente antes de parear novamente.'
        }
        if ([string]::IsNullOrWhiteSpace($Queue) -or $Queue -cnotin [Drawing.Printing.PrinterSettings]::InstalledPrinters) {
            throw 'Informe o nome exato de uma fila Windows instalada.'
        }
        $credential = Read-Host 'Credencial única do terminal Apollo' -AsSecureString
        Write-State $configPath @{ server = $Server.GetLeftPart('Authority'); queue = $Queue; secret = ($credential | ConvertFrom-SecureString) }
        Write-Output 'Terminal configurado. Execute o script sem argumentos para iniciar.'
        return
    }

    Add-Type -Path (Join-Path $PSScriptRoot 'ApolloAgentReceipt.cs') -ReferencedAssemblies System.Drawing
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Origin ([uri]$config.server)
    $secure = ConvertTo-SecureString $config.secret
    $credential = [Net.NetworkCredential]::new('', $secure).Password
    $request = @{ Method='Post'; Headers=@{ Authorization="Bearer $credential" }; TimeoutSec=10; MaximumRedirection=0; UseBasicParsing=$true }
    $poll = @{ queue = $config.queue } | ConvertTo-Json
    Write-Output 'Apollo Print Agent em execução. Ctrl+C encerra.'
    while ($true) {
        try {
            if (Test-Path $pendingPath) {
                $pending = Get-Content -LiteralPath $pendingPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $body = @{ attempt_id = $pending.attempt_id; station = $pending.station; outcome = $pending.outcome } | ConvertTo-Json
                $ticket = [uri]::EscapeDataString($pending.ticket_id)
                Invoke-RestMethod @request -ContentType 'application/json; charset=utf-8' -Body $body -Uri "$($config.server)/api/print-agents/jobs/$ticket/result" | Out-Null
                Remove-Item -LiteralPath $pendingPath
                continue
            }
            $job = Invoke-RestMethod @request -ContentType 'application/json; charset=utf-8' -Body $poll -Uri "$($config.server)/api/print-agents/jobs/next"
            if ($job) {
                $pending = @{ ticket_id=$job.ticket_id; attempt_id=$job.attempt_id; station=$job.station; outcome='indeterminate'; accepted=0 }
                Write-State $pendingPath $pending
                try {
                    if ($job.queue -cne $config.queue -or $job.copies -lt 1 -or $job.copies -gt 5) {
                        throw 'Fila Windows ou número de vias diferente do vínculo local.'
                    }
                    for ($copy = 1; $copy -le $job.copies; $copy++) {
                        $pending.started = $copy
                        Write-State $pendingPath $pending
                        $lines = @("VIA $copy/$($job.copies)") + @($job.lines)
                        [ApolloAgentReceipt]::Submit($config.queue, [string[]]$lines, "Apollo $($job.attempt_id) $copy")
                        $pending.accepted = $copy
                        if ($copy -eq $job.copies) { $pending.outcome = 'spooler_accepted' }
                        Write-State $pendingPath $pending
                    }
                } catch {
                    Write-Warning 'Resultado indeterminado. Confira a fila e o papel antes de reenviar.'
                }
                continue
            }
        } catch {
            $status = $_.Exception.Response
            if ($status -and [int]$status.StatusCode -in 401, 403, 409) {
                throw 'Terminal sem acesso ou fila indisponível. Confira o vínculo e as tentativas pendentes.'
            }
            Write-Warning 'Servidor indisponível. O agente tentará novamente.'
        }
        Start-Sleep -Seconds 4
    }
} finally {
    $gate.Dispose()
}
