# Deploy: this-week booked revenue (agentBuild `2026-09-09-week-revenue`)

## Why this exists

`/api/por/sync` was live and fresh but carried **no dated per-order money**, so
"how much are we pulling this week?" could not be answered from it. The detail
copy that *could* answer it (Redis CRM mirror) is a one-time CSV bootstrap from
**2026-08-10** that nothing refreshes — it was ~80% short for a current week.

Separately, the ENTERPRISE box is running an agent build **older** than this repo:
the deployed payload has no `money.revenue` and no `sales` block, both of which
were added here on 2026-08-13 and never shipped. This deploy ships those too.

## What changed

`Sync-PorSnapshot.ps1` now computes, for the **current Mon–Sun window**:

| Field | Meaning |
|---|---|
| `money.week.booked` | value of work going out this week, by `DeliveryDate` — quotes excluded |
| `money.week.collected` | cash actually received Mon–Sun (a different number) |
| `money.week.quotePipeline` | genuinely open quotes for the week — never counted as revenue |
| `money.week.byDay` / `byStatus` | per-day and per-lifecycle breakdown |
| `agentBuild` (top level) | proves which build ENTERPRISE is running |

Scope decisions, deliberate:
- **Quotes excluded** from booked; reported separately.
- **Cancelled excluded** (secondary `C` flag *and* the `Cancelled` column).
- **Archived kept** — a Monday order completed mid-week can already be archived,
  and dropping it would silently understate the week.
- Week start is `DATEFIRST`-independent, so it is Monday on any server locale.

Still **SELECT-only**. Every query starts with `WITH`, so `Assert-SelectOnly`
passes unchanged. Nothing writes to POR.

## Deploy (on ENTERPRISE, ~2 minutes)

The scheduled task `PartyPerfect-POR-Sync` already runs every 10 minutes, so
replacing the file *is* the deploy — no task changes needed.

1. Copy the updated `Sync-PorSnapshot.ps1` over
   `C:\PartyPerfect\por-sync-agent\Sync-PorSnapshot.ps1`.
   Leave `config.json` alone. `PorStatus.ps1` is unchanged this release.
2. Run once by hand and read the output:

```powershell
cd C:\PartyPerfect\por-sync-agent
powershell -ExecutionPolicy Bypass -File .\Sync-PorSnapshot.ps1
```

3. If it errors, the previous build is still installed and the scheduled task
   keeps pushing the old payload — POR is untouched either way. Send the log from
   `C:\PartyPerfect\por-sync-agent\logs\`.

## Verify from anywhere (no ENTERPRISE access needed)

```bash
curl -s -X POST https://partyperfect.app/api/auth/session \
  -H 'content-type: application/json' -d '{"password":"<team password>"}' -c /tmp/pp.jar >/dev/null
curl -s -b /tmp/pp.jar https://partyperfect.app/api/por/sync | python3 -m json.tool | head -60
```

Deploy succeeded when the payload contains:

- `"agentBuild": "2026-09-09-week-revenue"`
- `money.week.startDate` = the current Monday, `endDate` = that Sunday
- `money.week.booked.total` > 0 on a normal week

If `agentBuild` is absent, ENTERPRISE is still on the old build and the copy in
step 1 did not land.

## Known-good baseline for review

Against the 2026-08-10 export, this exact filter over 2026-09-07..09-13 returns
**15 booked orders / $39,241.76** (rent $31,437.60 · sale $5,410.00 · tax $768.15,
$6,602.47 already paid) and **8 open quotes / $16,756.05**. That snapshot is a
month stale and understates a live week — it is a logic check, not a target.

Same week in prior years, for scale: 2022 $51,856 · 2023 $72,958 ·
2024 $218,205 · 2025 $144,557.

## Not fixed by this deploy

The Redis CRM mirror is still frozen at 2026-08-10. Nothing refreshes it — the
only crons are `social` (15 min), `weekly-recap` (Mon 14:00) and
`time-square-sync` (hourly). Re-running the CRM/Postgres push from ENTERPRISE is
a separate job.
