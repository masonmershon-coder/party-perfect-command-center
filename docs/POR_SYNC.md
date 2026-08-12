# Live POR → Command Center (read-only)

**Principle:** Point of Rental on ENTERPRISE is the system of record. Command Center only stores a **copy**. No writes to POR SQL.

## Architecture

```
POR SQL (Server=ENTERPRISE,9676; Database=POR; ApplicationIntent=ReadOnly)
  → sync agent on ENTERPRISE (SELECT only, every ~10 min)
    → HTTPS POST /api/por/sync              → Redis por-snapshot.json
    → HTTPS POST /api/por/sync/catalog      → Redis por-catalog.json   (full ItemFile + NUM)
    → HTTPS POST /api/por/sync/reservations → Redis por-reservations.json
    → HTTPS POST /api/por/sync/crm          → Redis pp:por:* entity keys (CRM)
  → Inventory / Bookkeeping / Quoting availability / Mike+Madison CRM tools
```

**SQL connection:** always `host,port` form — **`ENTERPRISE,9676`**. Never `localhost\SQLEXP` or any named instance (SQL Browser is disabled on ENTERPRISE).

## CRM entity store (keyed, not flattened)

Bootstrap once from NAS export:

```bash
npm run por:ingest
# or: node --env-file=.env.local scripts/ingest-por-full.mjs
```

Source: `PARTYPERF/.../15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA/` (override with `POR_EXPORT_DIR`).

| Redis key | Source | Join key |
|-----------|--------|----------|
| `pp:por:cust:{CNUM}` | CustomerFile | CustNumb / CNUM |
| `pp:por:cust:{CNUM}:sites` | CustomerJobSite | Cnum |
| `pp:por:cust:{CNUM}:comments` | CustomerComments | CNUM |
| `pp:por:tx:{CNTR}` | Transactions | CNTR; customer via CUSN |
| `pp:por:tx-items:{CNTR}` | TransactionItems | ITEM → ItemFile.NUM |
| `pp:por:pay:{Payment}` | PaymentFile (no card ciphertext) | |
| `pp:por:pay:{Payment}:detail` | PaymentDetail | Contract → CNTR |
| `pp:por:item:{NUM}` | ItemFile | KEY via `pp:por:item-sku:{KEY}` |
| `pp:por:crm-meta` | sync meta + counts | |

**Excluded forever:** entire `CheckCardFile`; PaymentFile `Encrypted` / `EncryptedCard` / `CCAlias`. Customer ID/SSN/CC columns stripped from API/AI views. PII stays session-internal.

Live CRM refresh: full Customer*/Item/Payment* each cycle; Transactions + TransactionItems for **open STAT (R/O/Q) + delivery/pickup within ~90 days**. Historical depth comes from CSV bootstrap.

## Read APIs (session required)

- `GET /api/por/customer?q=` or `?cnum=` — history (dollars if owner)
- `GET /api/por/contract?cntr=` — contract + lines + payments
- `GET /api/por/balance?cntr=` or `?cnum=` — **owner only**
- `GET|POST /api/por/availability` — wraps `lib/por-availability.ts`

## Prerequisites

1. Upstash Redis linked — see [REDIS_SETUP.md](./REDIS_SETUP.md)
2. Vercel env `POR_SYNC_SECRET` = long random string (same value on ENTERPRISE)
3. SQL login with **db_datareader only** on database `POR` (not `sa`)

## Command Center API

- `GET /api/por/sync` — latest snapshot + sync meta (no secret)
- `GET /api/por/sync/health` — owner session: last success + last error per target
- `POST /api/por/sync` — push ops snapshot (`PorSnapshot` v1)
- `POST /api/por/sync/catalog` — push full active catalog (`PorCatalogState`, must include `num`)
- `POST /api/por/sync/reservations` — push future reservation lines (`PorReservationState`)
- `POST /api/por/sync/crm` — upsert CRM entity chunks
- `GET /api/por/sync/crm` — CRM meta

All POSTs: `Authorization: Bearer <POR_SYNC_SECRET>`

If sync fails, Command Center keeps the last good snapshot. UI shows **STALE** (amber) after **20 minutes**, and a red **POR sync stale — data may be outdated** banner after **60 minutes**, with **synced N min ago**. Catalog/reservations/CRM stay at last successful push until the next good pull. Owner dashboard: **POR sync health** (`GET /api/por/sync/health`) lists last success + last error per target.

## ENTERPRISE agent

Files live in `por-sync-agent/`:

| File | Purpose |
|------|---------|
| `Sync-PorSnapshot.ps1` | Read-only SQL → POST snapshot + catalog + reservations + CRM |
| `config.example.json` | Host `ENTERPRISE,9676`, DB, secret, CC URL |
| `Install-PorSyncTask.ps1` | Task Scheduler every 10 minutes (5–15 band) |
| `README.md` | Install steps |

Copy the folder to `C:\PartyPerfect\por-sync-agent\` on ENTERPRISE. Set `SqlServer` to **`ENTERPRISE,9676`**. Never commit real passwords or `POR_SYNC_SECRET`.

After updating the script on ENTERPRISE, run once manually and confirm logs show **Full catalog push OK**, **Reservations push OK**, and **CRM sync complete**.

## Safety rails

- Script only runs `SELECT` queries
- Named-instance connection strings (`\SQLEXP`) are rejected
- `ApplicationIntent=ReadOnly` on every connection
- Sync login should be `db_datareader`
- Do not open SQL/RDP to the public internet
- Do not replace Counter / EOD / payments in Command Center
- Never write back to POR

## Manual seed (fallback)

If ENTERPRISE sync isn’t updated yet:

```bash
npm run por:ingest
# or catalog-only:
node --env-file=.env.local scripts/seed-por-catalog.mjs
```
