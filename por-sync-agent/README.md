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

1. **Ops snapshot** → `/api/por/sync`  
   Inventory + AR + ops proxies, plus optional **sales** for Mike (open quotes / reservations / ~300-item sample).

2. **Full catalog** → `/api/por/sync/catalog`  
   All active `ItemFile` rows including **`NUM`** (required for availability join).

3. **Reservations** → `/api/por/sync/reservations`  
   Future `TransactionItems` + `Transactions` (status R/O firm, Q soft). Feeds `/api/quote/availability`.

If `ContractFile` / `Transactions` columns differ, those blocks log a WARN and the main inventory sync still works.

## Safety

- Script uses **SELECT only**
- Do not run as `sa` for day-to-day sync
- Logs: `C:\PartyPerfect\por-sync-agent\logs\`
