# POR sync agent (ENTERPRISE)

Read-only SQL → Party Perfect Command Center. **Never write back to POR.**

## Install

1. Copy this folder to `C:\PartyPerfect\por-sync-agent\` on ENTERPRISE.
2. Copy `config.example.json` → `config.json` and fill in:
   - `CommandCenterUrl` = `https://partyperfect.app`
   - `PorSyncSecret` = same as Vercel `POR_SYNC_SECRET`
   - `SqlServer` = **`ENTERPRISE,9676`** (host,port — SQL Browser is disabled; **never** `localhost\SQLEXP`)
   - `SqlDatabase` = `POR`
   - Windows auth or SQL login with **db_datareader only**
   - Connection always uses `ApplicationIntent=ReadOnly`
3. Test once:

```powershell
cd C:\PartyPerfect\por-sync-agent
powershell -ExecutionPolicy Bypass -File .\Sync-PorSnapshot.ps1
```

4. Install scheduled task (every 10 minutes — within the 5–15 min band):

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-PorSyncTask.ps1
```

## What it pushes

1. **Ops snapshot** → `/api/por/sync`
2. **Full catalog** → `/api/por/sync/catalog` (ItemFile + **NUM** + optional `imageUrl` for rentable SKUs)
3. **Reservations** → `/api/por/sync/reservations` (availability)
4. **CRM entities** → `/api/por/sync/crm` (Redis keyed store; customers, sites, comments, items, payments without card fields, open/recent transactions + items)
5. **Postgres `por.*`** → `/api/por/sync/postgres` (Supabase mirror; same CRM window; requires `DATABASE_URL` on Vercel)

Historical CRM/Postgres depth: run Command Center bootstrap once:
`node --env-file=.env.local scripts/ingest-por-supabase.mjs`
Live sync keeps smaller tables fresh and refreshes open/±90-day contracts.

## Exclusions

- Entire **CheckCardFile** — never SELECT
- PaymentFile **Encrypted / EncryptedCard / CCAlias** — never SELECT

## Safety

- Script uses **SELECT only**
- Rejects named-instance `SqlServer` values containing `\`
- Do not run as `sa` for day-to-day sync
- Logs: `C:\PartyPerfect\por-sync-agent\logs\`
