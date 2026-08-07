# Live POR → Command Center (read-only)

**Principle:** Point of Rental on ENTERPRISE is the system of record. Command Center only stores a **copy** of summary data. No writes to POR SQL.

## Architecture

```
POR SQL (localhost\SQLEXP)
  → sync agent on ENTERPRISE (SELECT only, every ~10 min)
    → HTTPS POST /api/por/sync              → Redis por-snapshot.json
    → HTTPS POST /api/por/sync/catalog      → Redis por-catalog.json   (full ItemFile + NUM)
    → HTTPS POST /api/por/sync/reservations → Redis por-reservations.json
  → Inventory / Bookkeeping / Quoting availability / Madison matching
```

## Prerequisites

1. Upstash Redis linked — see [REDIS_SETUP.md](./REDIS_SETUP.md)
2. Vercel env `POR_SYNC_SECRET` = long random string (same value on ENTERPRISE)
3. SQL login with **db_datareader only** on database `POR` (not `sa`)

## Command Center API

- `GET /api/por/sync` — latest snapshot + sync meta (no secret)
- `POST /api/por/sync` — push ops snapshot (`PorSnapshot` v1)
- `POST /api/por/sync/catalog` — push full active catalog (`PorCatalogState`, must include `num`)
- `POST /api/por/sync/reservations` — push future reservation lines (`PorReservationState`)

All POSTs: `Authorization: Bearer <POR_SYNC_SECRET>`

Optional `sales` block on the main snapshot: open quote/reservation counts, quotes with event in next 14 days, service SKUs + catalog sample for Mike. Missing `sales` is OK.

If sync fails, Command Center keeps the last good snapshot and UI shows **POR sync stale** after 30 minutes. Catalog/reservations stay at last successful push until the next good pull.

## ENTERPRISE agent

Files live in `por-sync-agent/`:

| File | Purpose |
|------|---------|
| `Sync-PorSnapshot.ps1` | Read-only SQL → POST snapshot + catalog + reservations |
| `config.example.json` | Host, DB, secret, CC URL |
| `Install-PorSyncTask.ps1` | Task Scheduler every 10 minutes |
| `README.md` | Install steps |

Copy the folder to `C:\PartyPerfect\por-sync-agent\` on ENTERPRISE (or update the existing copy). Never commit real passwords or `POR_SYNC_SECRET`.

After updating the script on ENTERPRISE, run once manually and confirm logs show **Full catalog push OK** and **Reservations push OK**.

## Safety rails

- Script only runs `SELECT` queries
- Sync login should be `db_datareader`
- Do not open SQL/RDP to the public internet
- Do not replace Counter / EOD / payments in Command Center

## Manual seed (fallback)

If ENTERPRISE sync isn’t updated yet:

```bash
node --env-file=.env.local scripts/seed-por-catalog.mjs
```

Seeds both `por-catalog.json` and `por-reservations.json` from `data/`.
