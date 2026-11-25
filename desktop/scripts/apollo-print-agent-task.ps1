#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Register','Start','Stop','Remove','Status','Printers')][string]$Action = 'Status',
    [ValidatePattern('^[A-Za-z0-9_-]{1,40}$')][string]$Profile = 'default'
)
$ErrorActionPreference = 'Stop'

if ($Action -eq 'Printers') {
    Add-Type -AssemblyName System.Drawing
    [Drawing.Printing.PrinterSettings]::InstalledPrinters
    return
}

$user = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskName = "ApolloPrintAgent-$($user.User.Value)-$Profile"
$root = Join-Path $env:LOCALAPPDATA 'ApolloPrintAgent'
if ($Profile -ne 'default') { $root = Join-Path (Join-Path $root 'profiles') $Profile }
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
switch ($Action) {
    'Register' {
        if ($task) { throw 'A tarefa já existe. Encerre e remova antes de apontar para outra versão.' }
        if (!(Test-Path -LiteralPath (Join-Path $root 'terminal.json'))) {
            throw 'Vincule o perfil com apollo-print-agent.ps1 antes de registrar a tarefa.'
        }
        $scriptPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'apollo-print-agent.ps1')).Path
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -Profile "{1}"' -f $scriptPath, $Profile
        $run = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
        $logon = New-ScheduledTaskTrigger -AtLogOn -User $user.Name
        $principal = New-ScheduledTaskPrincipal -UserId $user.Name -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $taskName -Action $run -Trigger $logon -Principal $principal -Settings $settings | Out-Null
        Write-Output 'Autoinício configurado para o usuário atual.'
    }
    'Start' { Start-ScheduledTask -TaskName $taskName }
    'Stop' { Stop-ScheduledTask -TaskName $taskName }
    'Remove' {
        if ($task.State -eq 'Running') { throw 'Encerre a tarefa antes de remover o autoinício.' }
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    'Status' {
        $info = if ($task) { Get-ScheduledTaskInfo -TaskName $taskName }
        [pscustomobject]@{
            Profile = $Profile
            State = if ($task) { $task.State } else { 'Unregistered' }
            LastResult = if ($info) { $info.LastTaskResult }
            Pending = Test-Path -LiteralPath (Join-Path $root 'pending.json')
            Log = Join-Path $root 'agent.log'
        }
    }
}
