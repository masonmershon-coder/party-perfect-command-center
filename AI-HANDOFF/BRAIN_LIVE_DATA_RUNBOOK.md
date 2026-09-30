# Making POR live in the brain — runbook

**Check state first:** `node AI-HANDOFF/brain-status.mjs`
**Contract tests:** `node AI-HANDOFF/test-brain-status.mjs` (hermetic — no network, no credentials)

---

## The freshness contract

`brain-status.mjs` grades every source by age:

| Status | Age | May its figures be quoted as current? |
|---|---|---|
| **LIVE** | ≤ 60 min | yes |
| **STALE** | ≤ 24 h | only with the cutoff date stated |
| **FROZEN** | > 24 h | **no** — state the cutoff, or decline |
| **OFFLINE** | unreachable | **no** |
| **UNKNOWN** | no/unparseable timestamp | **no** — never assume LIVE |

> Do not present figures derived from a FROZEN, OFFLINE, or UNKNOWN source as current.
> State the cutoff date, or say you cannot answer.
> **A confident wrong number is the failure mode — not an unanswered question.**

`presentationGuard(source)` returns the caveat an answer must carry. Callers must not drop it.

**Order of preference for any dated money question:**
1. Direct SQL — authoritative, any range
2. `money.week` / `money.revenue` from the ops snapshot
3. Transaction detail mirror
4. Offline export — **label the cutoff date explicitly, every time**

---

## The three pipes

"POR isn't live in the brain" is three separate problems wearing one label.

| Pipe | Carries | Typical failure |
|---|---|---|
| **1. Ops snapshot** → `/api/por/sync` | AR, aging, payments 24 h, inventory, today's counts | usually healthy |
| **2. Transaction detail** → `/api/por/sync/crm` → Redis | transactions, every dated dollar | frozen when the sync agent predates the CRM push |
| **3. Direct SQL** | ad-hoc queries, any date range | credential expiry |

Pipes 1 and 2 are produced by the **same PowerShell agent on the POR host**. An outdated
agent starves both at once: the ops payload loses `money.revenue`, `money.week`, `sales`
and `agentBuild`, *and* the detail mirror stops refreshing. Re-deploying that one file
fixes both. Pipe 3 is independent and is a credential matter.

**Diagnostic:** if `brain-status.mjs` reports *no `agentBuild`* on the ops snapshot, the
deployed agent is outdated — that single symptom explains a frozen detail mirror too.

---

## Fix A — redeploy the sync agent (fixes pipes 1 + 2)

**Needs: file access to the POR host. Needs no credential change.**

The scheduled task already runs on an interval, so replacing the file *is* the deploy.

1. Copy `por-sync-agent/Sync-PorSnapshot.ps1` (and `PorStatus.ps1` if changed) over the
   installed copy. Leave `config.json` alone — it holds host settings.
2. Run it once by hand and confirm it completes without error.
3. Verify from anywhere: `node AI-HANDOFF/brain-status.mjs`

**Deployed correctly when:** the ops snapshot reports an `agentBuild`, no MISSING FIELDS
line appears, and the transaction detail flips FROZEN → LIVE within one sync interval.

If it errors, the previous build is still installed and still pushing — POR is untouched
either way.

---

## Fix B — restore direct SQL access (fixes pipe 3)

**Needs: a database administrator. Claude does not reset, inspect, or handle credentials.**

Only needed for ad-hoc queries over arbitrary date ranges. The brain is live without it
once Fix A lands.

**Recommended: a least-privilege, read-only POR service account.**

The sync and query work is `SELECT`-only and should not run as an administrator.

1. Create a dedicated service account used by nothing else.
2. Grant it **`db_datareader` on the POR database only** — no write role, no server roles,
   no access to other databases.
3. Deny or omit access to card/PII columns the agent never needs: `CheckCardFile` in full,
   and `PaymentFile.Encrypted` / `EncryptedCard` / `CCAlias`.
4. Point `config.json` and the local keychain entry at that account.
5. Rotate it on the organisation's normal schedule and record the owner.

An expiring password on a least-privilege account is a *feature*: it forces periodic
review of an account that can read customer and financial data. **Do not exempt an
administrator account from expiry to keep this integration working** — that trades a
two-minute rotation for a permanent standing credential with far more authority than the
job requires. If expiry is disruptive, the fix is a narrower account and a rotation
runbook, not a longer-lived admin password.

Whoever performs the rotation enters the new password directly into the local keychain at
a hidden prompt. It is never typed into a chat, a command line, a file, or a commit.

---

## Interpreting historical evidence in this repository

Audit documents under `AI-HANDOFF/EVIDENCE/` record what was true **on their stated date**.
Revenue figures, source ages, worker heartbeats, and "N days frozen" claims in those files
are **historical evidence, not current runtime state**, unless independently reproduced by
a live query today.

Treat any dated figure in an evidence file the same way `brain-status.mjs` treats a FROZEN
source: quote it with its date, or re-derive it.

---

## Who does what

| Fix | Who | Unblocks |
|---|---|---|
| A — redeploy sync agent | anyone with file access to the POR host | live detail + weekly revenue for every agent |
| B — least-privilege read-only account | database administrator | ad-hoc date-range queries |

Claude can do neither: no file access to that host, and credential handling is out of
scope by design.
