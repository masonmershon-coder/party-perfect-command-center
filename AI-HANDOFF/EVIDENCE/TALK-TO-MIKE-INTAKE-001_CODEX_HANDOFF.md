# TALK-TO-MIKE-INTAKE-001 — Claude → Codex handoff record

**Date:** 2026-08-13 · **Publisher:** Claude · **Certifier:** Codex
**Handoff mode:** automatic via control plane · **Mason relayed nothing**

## Result

| | |
|---|---|
| Prior verdict | BLOCKED — evidence not visible |
| New verdict | **NEEDS_FIX** — evidence visible, two defects found |
| Commit verified | `7772b1e88cf802b182f7ca00e22cc5e8f4612351` |
| Codex session | `019ffccc-9e2a-7783-ad35-4de40eaaebf5` |

**The block is cleared.** Codex moved from "cannot see the evidence" to a substantive verdict on
real code. It is now failing the implementation on its merits, which is the outcome we wanted —
a verdict, not a visibility problem.

## Proof Codex actually reached the evidence

From its own `checked` list — each item is something it re-derived, not something it accepted:

- confirmed HEAD and branch point to `7772b1e88cf802b182f7ca00e22cc5e8f4612351`
- **independently re-derived** commit scope: 23 added files, 2,464 insertions, no deletions
- **ran the suite itself** (`node --import tsx`) and observed all 17 checks pass
- **compared memory vs Postgres** queue, lease, ACK, fail, retry and dead-letter behaviour
- inspected CREATE / COMPLETE / STATUS, device and worker auth, sender isolation, signed-upload
  handling, route wiring, migration RLS, shortcut credential boundaries
- re-ran the secret patterns: only the five synthetic fixtures at
  `scripts/test-mike-intake.ts:24-28` matched
- confirmed migration `0007` remains a held repository artifact

## Findings — Codex owns these

### P1 · `lease-callback-not-fenced` — `lib/mike-intake-pg.ts:175`

ACK and FAIL are not tied to a lease *attempt*. `ackDelivered` sets `state='DELIVERED'` and
clears `lease_until` but **leaves `lease_owner` populated**; `failAttempt` guards only on
`lease_owner=$2`. A delayed or duplicate FAIL therefore still matches and moves a **delivered**
command back to `QUEUED` — re-delivering a message Mason already received. Neither statement
checks `lease_until > now()` or a fencing token, and the worker identity is fixed, so a callback
from an expired lease can mutate a newer lease held by the same worker.

**Independently confirmed by Claude by reading the source.** This is a genuine defect.

Notably it lives in the pg backend — the exact divergence the bundle told Codex to attack, and
the tests exercise the memory backend, so the suite passes while this is broken.

### P2 · `unsupported-mime-queued` — `lib/mike-intake.ts:325`

COMPLETE rejects only a *recognized* MIME type that differs from the reserved type. An
unsupported `headObject` content type normalizes to `null` and bypasses rejection, so the object
gets queued anyway.

## Not done, per instruction

- **no repair or redesign** of Talk-to-Mike
- migration `0007` — **still HELD**, unapplied
- production deployment — **still DENIED**
- Mason / Josh / worker production tokens — **NOT PROVISIONED**
- branch — **not pushed**

## Control-plane assessment

The automated handoff worked end to end: state transition → dispatcher → Codex → verdict →
findings recorded, with no human copying files.

The original failure was **not** a transport defect. The control plane was fine; the
implementation had simply never been committed, so there was nothing for a verifier to point at.
Committing it was the whole repair.

**Residual control-plane risk:** the governor's `max_retries = 1` ceiling refused a third
verification pass on `GH-BRIDGE-001` earlier today. If Talk-to-Mike needs more than two
Codex rounds after repair, it will hit the same ceiling. That limit is Mason's to raise; it was
not raised to obtain a verdict here.

---

## Round 2 — fixes applied, certification blocked by the governor

**Commit `d737ef0a85bcb3d494ff63ca3434a2b97f6675a6`** on the same branch. Both Codex findings
fixed. 21 checks pass. The 3 new regressions were verified against the pre-fix code and **all 3
fail there**, so they are not vacuous.

**Codex could not run:** `BLOCKED_RETRY_LIMIT: 2 attempts exceeds max_retries 1`.

**The ceiling was not raised.** It is the cost guard from the 2026-08-12 unauthorized paid-compute
incident, and raising a safety limit to obtain a green verdict is the behaviour it exists to stop.

### This is now a pattern, not a one-off

`max_retries = 1` has blocked two tasks today (`GH-BRIDGE-001`, `TALK-TO-MIKE-INTAKE-001`). The
normal certification path is:

```
verify -> NEEDS_FIX -> fix -> verify again
```

That is **two** verification attempts by definition. A ceiling of 1 makes the standard
fix-and-recheck loop unreachable, so no task that fails its first review can ever be certified.

The guard is correct; the value is too low for the workflow it governs. Raising it is Mason's
decision — `AI-HANDOFF/governor/POLICY.json`, `limits.max_retries`.

**Status:** fixes implemented and self-tested · **NOT independently certified.**
