<#
.SYNOPSIS
  Create PPL Storage folders + SMB share on K: (no POR DB access).
#>
[CmdletBinding()]
param(
  [string]$Root = "K:\Shares\PPL Storage",
  [string]$ShareName = "PPL-Storage"
)

$ErrorActionPreference = "Stop"

$folders = @("Photos", "Contracts-PDF", "Hiring-Docs", "Marketing", "Archive")
New-Item -ItemType Directory -Force -Path $Root | Out-Null
foreach ($f in $folders) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root $f) | Out-Null
}

$existing = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if (-not $existing) {
  try {
    New-SmbShare -Name $ShareName -Path $Root -FullAccess "Administrators" -ChangeAccess "Everyone" | Out-Null
    Write-Host "Created SMB share \\$env:COMPUTERNAME\$ShareName → $Root"
  } catch {
    Write-Warning "Could not create SMB share automatically: $($_.Exception.Message)"
    Write-Host "Folders created at $Root — create the share manually in Server Manager if needed."
  }
} else {
  Write-Host "Share '$ShareName' already exists → $($existing.Path)"
}

Get-ChildItem $Root | Format-Table Name, LastWriteTime
