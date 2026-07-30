# PPL Storage NAS shares (K: drive)

Parallel to POR sync — **does not touch** the Point of Rental database.

## Disk

| | |
|--|--|
| Drive | `K:\` (CompanyDrive) |
| Share root | `K:\Shares\PPL Storage` |
| Free space (approx) | ~915 GB |

## Recommended folders

Create under `K:\Shares\PPL Storage\`:

```
Photos\
Contracts-PDF\
Hiring-Docs\
Marketing\
Archive\
```

## Create SMB share (run as admin on ENTERPRISE)

```powershell
# From repo copy: por-sync-agent\Setup-PplStorageShares.ps1
# Or paste:

$root = 'K:\Shares\PPL Storage'
$folders = @('Photos','Contracts-PDF','Hiring-Docs','Marketing','Archive')
New-Item -ItemType Directory -Force -Path $root | Out-Null
foreach ($f in $folders) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $f) | Out-Null
}

# Share the root (adjust ACL for RENTAL domain users as needed)
if (-not (Get-SmbShare -Name 'PPL-Storage' -ErrorAction SilentlyContinue)) {
  New-SmbShare -Name 'PPL-Storage' -Path $root -FullAccess 'RENTAL\Domain Admins' -ChangeAccess 'RENTAL\Domain Users'
}

Get-SmbShare -Name 'PPL-Storage' | Format-List
Get-ChildItem $root
```

UNC path from shop PCs: `\\ENTERPRISE\PPL-Storage` (or `\\192.168.0.5\PPL-Storage`).

## Later (optional)

Link folders in Command Center for photos / hiring docs. Still never write POR SQL from the web app.
