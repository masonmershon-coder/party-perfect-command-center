# POR sync agent (ENTERPRISE)

Read-only SQL snapshot → Party Perfect Command Center.

## Install

1. Copy this folder to `C:\PartyPerfect\por-sync-agent\` on ENTERPRISE.
2. Copy `config.example.json` → `config.json` and fill in:
   - `CommandCenterUrl` = `https://partyperfect.app`
   - `PorSyncSecret` = same as Vercel `POR_SYNC_SECRET`
   - SQL connection (Windows auth or SQL login with **db_datareader only**)
3. Test once:

```powershell
cd C:\PartyPerfect\por-sync-agent
powershell -ExecutionPolicy Bypass -File .\Sync-PorSnapshot.ps1
```

4. Install scheduled task (every 10 minutes):

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-PorSyncTask.ps1
```

## What it pushes

Inventory + AR + ops proxies, plus optional **sales** for Mike:
- Open quotes / reservations / quotes with event in next 14 days (`ContractFile` when present)
- Service SKUs (delivery, flip, linen bag, labor) + ~300-item catalog sample with rates

If `ContractFile` columns differ, quote counts log a WARN and stay `0` — inventory sync still works.

## Safety

- Script uses **SELECT only**
- Do not run as `sa` for day-to-day sync
- Logs: `C:\PartyPerfect\por-sync-agent\logs\`
