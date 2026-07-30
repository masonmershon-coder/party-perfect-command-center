# Live POR → Command Center (read-only)

**Principle:** Point of Rental on ENTERPRISE is the system of record. Command Center only stores a **copy** of summary data. No writes to POR SQL.

## Architecture

```
POR SQL (localhost\SQLEXP)
  → sync agent on ENTERPRISE (SELECT only)
  → HTTPS POST /api/por/sync (Bearer POR_SYNC_SECRET)
  → Redis key por-snapshot.json
  → Inventory / Bookkeeping / Dashboard / Mike
```

## Prerequisites

1. Upstash Redis linked — see [REDIS_SETUP.md](./REDIS_SETUP.md)
2. Vercel env `POR_SYNC_SECRET` = long random string (same value on ENTERPRISE)
3. SQL login with **db_datareader only** on database `POR` (not `sa`)

## Command Center API

- `GET /api/por/sync` — latest snapshot + sync meta (no secret)
- `POST /api/por/sync` — push snapshot  
  Header: `Authorization: Bearer <POR_SYNC_SECRET>`

Payload shape: `PorSnapshot` (`version: 1`) — see `lib/types.ts`.

If sync fails, Command Center keeps the last good snapshot and UI shows **POR sync stale** after 30 minutes.

## ENTERPRISE agent

Files live in `por-sync-agent/`:

| File | Purpose |
|------|---------|
| `Sync-PorSnapshot.ps1` | Read-only SQL → POST snapshot |
| `config.example.json` | Host, DB, secret, CC URL |
| `Install-PorSyncTask.ps1` | Task Scheduler every 10 minutes |
| `README.md` | Install steps |

Copy the folder to `C:\PartyPerfect\por-sync-agent\` on ENTERPRISE. Never commit real passwords or `POR_SYNC_SECRET`.

## Safety rails

- Script only runs `SELECT` queries
- Sync login should be `db_datareader`
- Do not open SQL/RDP to the public internet
- Do not replace Counter / EOD / payments in Command Center
