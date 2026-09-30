# POR sync-agent deployment package — VERIFICATION ONLY, NOT DEPLOYED

**Prepared:** 2026-09-30 · **Branch:** `claude/MATTER-FRESHNESS-EVIDENCE-CLEANUP`
**Nothing in this package has been copied to the POR host. No credential was reset.**

---

## 1. Source files and SHA-256

Authoritative copies live in git on `claude/brain-live-por-001` @ `dfe4a35`.
Staging copies were placed on the removable volume for physical transport.

| File | SHA-256 | Bytes |
|---|---|---:|
| `por-sync-agent/Sync-PorSnapshot.ps1` | `6acc7ed47ecd3f345e8b17a9f42c52708daff5861bdb5a9baf76b155e6f6161f` | 49,804 |
| `por-sync-agent/PorStatus.ps1` | `d0c5e0dbd4d71ba26776859288c543aa2fa9e189c15b25e867a3ff66d6a0cd15` | 5,933 |
| `por-sync-agent/Get-PorRevenue.ps1` | `87c17041834c85af2b395fac2ebe8202e0fba715a4f345b4df50de0b95456935` | 5,923 |

**Staging copies verified byte-identical to git** on 2026-09-30 (all three MATCH).
Re-verify before deploying — a staged file is only as good as its last check:

```
shasum -a 256 <staged file>        # compare against the table above
```

On the POR host (PowerShell):

```
Get-FileHash .\Sync-PorSnapshot.ps1 -Algorithm SHA256
```

Supporting documents in the staging folder (not deployed, operator reading only):
`READ-ME-FIRST.txt`, `RUN-ON-SERVER-revenue.txt`, `DEPLOY_WEEK_REVENUE.md`.

---

## 2. Intended destination paths

| Source | Destination on the POR host |
|---|---|
| `Sync-PorSnapshot.ps1` | `<agent install dir>\Sync-PorSnapshot.ps1` |
| `PorStatus.ps1` | `<agent install dir>\PorStatus.ps1` |
| `Get-PorRevenue.ps1` | `<agent install dir>\Get-PorRevenue.ps1` *(optional tool)* |

`<agent install dir>` is the existing installation directory already referenced by the
scheduled sync task. **Do not create a new location, and do not guess it** — read it from
the installed scheduled task's action. The physical machine is the authority on its own
paths.

**`config.json` is never overwritten.** It holds host, port, database and account
settings. Replacing it would break the integration and could point the agent at the
wrong host.

---

## 3. Pre-deployment checks

Run in order. **Any failure stops the deployment.**

1. **Hash check** — all three files match §1 on the host, after transfer.
2. **Install dir confirmed** — read from the scheduled task, not assumed.
3. **`config.json` present and untouched** — record its own SHA-256 before and after;
   it must be identical.
4. **Backup taken** — §4, verified readable.
5. **Current build recorded** — capture the live payload's `agentBuild` (likely absent)
   so the change is provable afterwards.
6. **No concurrent run** — the scheduled task is not mid-execution.
7. **Operator has rollback authority** — whoever deploys can also restore §4 immediately.

---

## 4. Backup and rollback

**Before copying anything:**

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $installDir "backup-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item "$installDir\Sync-PorSnapshot.ps1","$installDir\PorStatus.ps1" $backup
Get-FileHash "$backup\*.ps1" -Algorithm SHA256 | Format-Table
```

**Rollback** — copy the backup copies back over the installed paths. No other action is
needed: the scheduled task picks up the restored file on its next interval, and POR itself
was never modified, so there is nothing to undo on the database side.

**Rollback trigger — any of:**
- the manual run exits non-zero or writes an error to the log
- the ops payload stops arriving, or `syncedAt` stops advancing
- any field that was present before disappears
- the transaction-detail mirror does not begin refreshing within two intervals

---

## 5. Read-only guarantees

These are properties of the shipped script, verifiable by reading it before deploying:

- Every SQL statement is `SELECT`. `Assert-SelectOnly` rejects anything whose first
  keyword is not `SELECT`/`WITH`, and rejects `INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|
  TRUNCATE|EXEC|EXECUTE` anywhere in the text.
- The connection is opened with `ApplicationIntent=ReadOnly`.
- `CheckCardFile` is never selected.
- `PaymentFile.Encrypted`, `EncryptedCard` and `CCAlias` are never selected.
- The agent pushes outward over HTTPS; it exposes no inbound listener.
- No credential value is written to disk or to any log by this change.

**Unproven here:** these are read from source, not observed at runtime on the host. A
runtime assertion requires the manual run in §7.

---

## 6. Fields expected after deployment

The live payload should gain all of the following. Absence of `agentBuild` is the single
clearest signal the deploy did not land.

| Field | Meaning |
|---|---|
| `agentBuild` | build marker; proves which version is installed |
| `money.revenue` | collected: last 7 days, month-to-date, last 30 days, year-to-date |
| `money.week` | **booked** revenue for the current Mon–Sun by event date, with by-day and by-status breakdowns |
| `sales` | open quotes, open reservations, quotes with events inside 14 days |
| CRM mirror freshness | `pp:por:crm-meta.syncedAt` begins advancing each interval, and its `source` stops reading as a hand-loaded bootstrap |

**Booked ≠ collected.** `money.week` is the value of work going out; `money.revenue` is
cash received. They legitimately differ and must never be added together.

---

## 7. Verification commands — no credentials exposed

**On the host, once, by hand:**

```powershell
cd <agent install dir>
powershell -ExecutionPolicy Bypass -File .\Sync-PorSnapshot.ps1
```

Expect a clean exit and a new log entry. The script prints no secret.

**From any machine with the repo:**

```
node AI-HANDOFF/brain-status.mjs
node AI-HANDOFF/brain-status.mjs --json
```

`brain-status.mjs` reads no credential value, emits an allow-listed field set only, and
requires `POR_SQL_HOST`/`POR_SQL_PORT` and a **read-only** KV token to probe at all —
without them it reports `UNKNOWN` rather than guessing. Its `--json` output is safe to
paste into a ticket: verified by hermetic test 8 against a deliberately dirty fixture.

---

## 8. Fail-closed behaviour

- **Deploy fails** → the previous build remains installed and continues pushing. POR is
  untouched either way. There is no partially-deployed state: the unit of change is one
  file replaced atomically by copy.
- **Agent errors at runtime** → it logs and exits; stale data simply stops advancing. The
  freshness contract then marks the source STALE and later FROZEN, so downstream agents
  refuse to quote it as current rather than serving silently old numbers.
- **A field fails to compute** → the week/revenue blocks are wrapped so a query failure
  logs a warning and omits the block instead of aborting the whole push.
- **Status tool cannot reach a source** → `UNKNOWN` (never probed) or `OFFLINE` (probed,
  dead). Neither is ever reported as LIVE.

---

## 9. Evidence required before declaring the mirror LIVE

Do not record the mirror as LIVE until **all** of these are observed. Documents and
timestamps in this repository are not runtime proof.

1. `agentBuild` present in the live payload, matching the deployed build.
2. `money.revenue`, `money.week` and `sales` all present and internally consistent
   (`money.week.booked.total` equals the sum of its `byDay` entries).
3. `pp:por:crm-meta.syncedAt` advanced **at least twice** across separate intervals —
   one advance could be a manual run.
4. `crm-meta.source` no longer describes a hand-loaded bootstrap.
5. `brain-status.mjs` reports the transaction detail as **LIVE**, with a cutoff inside the
   LIVE window, on a machine whose clock is not skewed (a future timestamp yields UNKNOWN).
6. One dated figure reproduced independently — the same week queried two ways agreeing.
7. All of the above captured with timestamps in an evidence file under `AI-HANDOFF/EVIDENCE/`.

**Until then the mirror is reported FROZEN and its figures carry a cutoff date.**

---

## 10. What this package deliberately does not do

- Does not copy anything to the POR host.
- Does not reset, inspect, or handle any credential.
- Does not modify `config.json`.
- Does not install, arm, or schedule anything.
- Does not merge or deploy application code.
- Does not claim the deploy has happened or that the mirror is live.
