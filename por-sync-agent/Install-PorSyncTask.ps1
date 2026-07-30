<#
.SYNOPSIS
  Install Task Scheduler job for read-only POR → Command Center sync.
#>
[CmdletBinding()]
param(
  [string]$TaskName = "PartyPerfect-POR-Sync",
  [int]$Minutes = 10
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "Sync-PorSnapshot.ps1"
if (-not (Test-Path $script)) { throw "Missing Sync-PorSnapshot.ps1" }
if (-not (Test-Path (Join-Path $PSScriptRoot "config.json"))) {
  throw "Create config.json from config.example.json before installing the task."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration ([TimeSpan]::MaxValue)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Scheduled task '$TaskName' installed (every $Minutes minutes)."
Write-Host "Run once now: Start-ScheduledTask -TaskName '$TaskName'"
