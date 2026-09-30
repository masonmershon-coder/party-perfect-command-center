# Making POR live in the brain — runbook

**Check state first:** `node AI-HANDOFF/brain-status.mjs`

---

## The finding (2026-09-30)

"POR isn't live in the brain" is three separate problems wearing one label.

| Pipe | Carries | State | Root cause |
|---|---|---|---|
| **1. Ops snapshot** → `/api/por/sync` | AR, aging, payments 24h, inventory, today's counts | **LIVE** — minutes old | working |
| **2. Transaction detail** → `/api/por/sync/crm` → Redis | 36k transactions, every dated dollar | **FROZEN 50 days** | ENTERPRISE runs a script build that predates the CRM push |
| **3. Direct SQL** → `192.168.0.5:9676` | ad-hoc queries, any date range | **DEAD since 2026-09-11** | `4453cadmin` password expired at 30 days |

Pipes 1 and 2 come from the **same PowerShell script on ENTERPRISE**. That box is running a build from **before 2026-08-07** — older than `origin/main`. Proof: the live payload has no `money.revenue` (added `533bd89`, Aug 7), no `sales`, no `money.week`, and no `agentBuild`.

**So one file copy fixes pipe 1's missing fields AND unfreezes pipe 2.** The expired password only blocks pipe 3.

---

## Fix A — deploy the sync agent (fixes pipes 1 + 2)

**Needs: file access to ENTERPRISE. Does NOT need the password reset.**
Everything else waits on this. ~2 minutes.

The scheduled task `PartyPerfect-POR-Sync` already runs every 10 minutes, so replacing the file *is* the deploy.

1. Copy `por-sync-agent/Sync-PorSnapshot.ps1` from this repo over
   `C:\PartyPerfect\por-sync-agent\Sync-PorSnapshot.ps1`.
   Leave `config.json` alone. `PorStatus.ps1` is unchanged.
2. Run once by hand:

```powershell
cd C:\PartyPerfect\por-sync-agent
powershell -ExecutionPolicy Bypass -File .\Sync-PorSnapshot.ps1
```

3. Verify from anywhere: `node AI-HANDOFF/brain-status.mjs`

**Deployed correctly when:** ops snapshot shows `agentBuild 2026-09-09-week-revenue`, no MISSING FIELDS line, and transaction detail flips FROZEN → LIVE within 10 minutes.

If it errors, the old build is still installed and still pushing — POR is untouched either way. Send the log from `C:\PartyPerfect\por-sync-agent\logs\`.

### What deploying turns on

- `money.revenue` — collected: last 7 days, MTD, last 30, YTD
- `money.week` — **booked revenue for the current Mon–Sun by event date**, with by-day and by-status breakdowns (added 2026-09-09)
- `sales` — open quotes, open reservations, quotes with events inside 14 days
- **CRM push** — the transaction detail mirror refreshes every 10 minutes instead of never
- `agentBuild` — so the deployed build is provable, not inferred

---

## Fix B — reset the POR credential (fixes pipe 3)

**Needs: Active Directory access on ENTERPRISE. ~5 minutes.**

Only needed for ad-hoc direct queries (arbitrary date ranges, the Saturday labor report, tent analysis). The brain is live without it once Fix A lands.

1. On ENTERPRISE, reset `4453cadmin` and **check "Password never expires"** — otherwise this recurs every 30 days.
2. On this Mac, in Terminal (prompts with hidden input; never paste a password into a chat or a file):

```bash
security add-generic-password -a 4453cadmin -s enterprise-winrm -U -w
```

3. Verify: `node AI-HANDOFF/brain-status.mjs` — Direct POR SQL should stop warning about credential age.

**Security note:** `4453cadmin` looks like a domain admin account. A read-only job does not need admin. Prefer a dedicated service account with `db_datareader` on the `POR` database only, and update `config.json` + the keychain entry to match.

---

## Fix C — refresh the SSD export (optional)

The 524-table dump on PARTYPERF is from 2026-08-10 and is the offline fallback. Re-run `Export-PorFullDump.ps1` on ENTERPRISE when convenient. Not needed once A and B are done.

---

## The contract every agent must follow

`brain-status.mjs` grades each source by age: **LIVE** ≤60 min · **STALE** ≤24 h · **FROZEN** beyond that.

> Do not present figures derived from a FROZEN or OFFLINE source as current.
> State the cutoff date, or say you cannot answer.
> A confident wrong number is the failure mode — not an unanswered question.

This is not hypothetical. Between 2026-09-11 and 2026-09-30 the transaction detail was 50 days stale while the ops snapshot beside it was 2 minutes old. Weekly revenue answered from the frozen mirror came in roughly **half** of actual — one week read $64,384 against a true $116,813. Both sources sat in "the brain" with nothing marking the difference.

**Order of preference for any dated money question:**
1. Direct SQL (pipe 3) — authoritative, any range
2. `money.week` / `money.revenue` from the ops snapshot (pipe 1, after Fix A)
3. Transaction detail mirror (pipe 2, after Fix A)
4. SSD export — **label the cutoff date explicitly, every time**

---

## Who does what

| Fix | Who | Time | Unblocks |
|---|---|---|---|
| A — deploy sync agent | anyone with file access to ENTERPRISE | 2 min | live detail + week revenue for every AI |
| B — reset credential | whoever administers ENTERPRISE / AD | 5 min | ad-hoc queries, Saturday labor report |
| C — refresh SSD export | anyone on ENTERPRISE | 20 min | offline fallback only |

Claude cannot do A (no file access to that Windows box) or B (cannot read, reset, or handle the credential). Both are on-site actions.
