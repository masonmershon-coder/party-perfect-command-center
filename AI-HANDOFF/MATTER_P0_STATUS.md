# Matter P0 — execution substrate: status

**Date:** 2026-08-17 · **Reported by:** Claude (claude-code)
**Standard applied:** "Do not report COMPLETE because tests pass." This is **NOT COMPLETE**.

## HEADLINE: the root cause is macOS launchd, and it is an owner-level blocker

The audit asked *why* timers stopped. I did not merely kickstart and declare victory — I built a
minimal control job to isolate it:

| Test | Plist | Result |
|---|---|---|
| `StartInterval 30` + `RunAtLoad true`, trivial `/bin/sh` | brand-new, minimal, correct | **`runs = 0`** — never fired, not even RunAtLoad |
| Manual `launchctl kickstart` on that same job | — | **works instantly** (wrote its log line) |
| `KeepAlive true`, process killed with `kill -9` | brand-new, minimal | **NOT respawned** |

**Conclusion: in this user's launchd domain, jobs execute only on explicit `kickstart`. Automatic
scheduling is dead across the board — `RunAtLoad`, `StartInterval`, and `KeepAlive` all fail on a
brand-new correct plist.** This is not a bug in the Party Perfect plists; it reproduces on a
three-line control job. `launchctl print-disabled` shows the agents as `enabled`, and sleep is
ruled out (`caffeinate` held `PreventSystemSleep` for 240 h).

This single fact explains the entire 31/100 score: `com.partyperfect.matter` silent 2.6 days,
github-bridge `runs=1`, meeting-watcher `runs=3`, intake orphaned at `ppid 1`.

**It cannot be fixed from code.** Most likely macOS Background Task Management is refusing to run
the agents (System Settings → General → Login Items & Extensions → *Allow in the Background*), or
the login/session domain is degraded. **Owner action required** — see the end of this file.

### Consequence for the P0 design

P0-3 says the watchdog "needs launchd/system supervision". **That requirement is currently
unsatisfiable.** Building a launchd-supervised watchdog now would be theatre: it would not start
at boot, would not tick, and would not respawn.

What demonstrably *does* survive on this Mac is a **long-running process with its own internal
loop** — the iMessage bridge (pid 40933) and the OpenClaw gateway (pid 13439) have stayed up for
days. That matches the P0 guidance to "prefer persistent supervised workers over fragile periodic
launch", and is the design I recommend — but it still needs launchd (or a login item) to survive a
reboot, so the blocker stands.

---

## DONE and PROVEN

### P0-1 Durable task leases · P0-2 Dead-letter queue — `matter/execution.mjs`

Additive; does not modify `control-plane.mjs`. Implements the required states
(`QUEUED LEASED RUNNING SUCCEEDED FAILED_RETRYABLE FAILED_PERMANENT DEAD_LETTER BLOCKED
WAITING_APPROVAL`), expiring leases with renewal, attempt limits, idempotency keys, an append-only
lease log, and a real DLQ carrying task id, reason, attempts, worker history, last error,
timestamps, artifacts and a recommended recovery.

**11/11 failure tests pass** (`node test-execution.mjs`, hermetic) — these are P0-10 cases, not
happy paths:

| # | Test | Result |
|---|---|---|
| 1 | worker dies mid-task → expired lease **reclaimed**, task requeued | PASS |
| 2 | live lease **blocks** a second worker (no duplicate work) | PASS |
| 3 | `renew` keeps a long task alive past its original TTL | PASS |
| 4 | retryable failures requeue, then **DEAD-LETTER** at the attempt limit | PASS |
| 5 | permanent failure dead-letters immediately, never retried | PASS |
| 6 | expired lease at attempt limit dead-letters instead of looping forever | PASS |
| 7 | approval-gated work parks `WAITING_APPROVAL` and is **not leasable** | PASS |
| 8 | idempotency key stable per attempt (reclaim ≠ duplicate work) | PASS |
| 9 | success is terminal and clears the lease | PASS |
| 10 | **THE INVARIANT** — no task silently abandoned (`abandoned: []`) | PASS |
| 11 | `reclaim()` safe to run repeatedly | PASS |

### P0-7 Queue rescue — reconciliation (classification only, nothing executed)

47 tasks classified. **The stall has two causes, not one:**

| Disposition | Count | Meaning |
|---|---|---|
| STILL_VALID | 22 | `NEW`, no blocker recorded — genuinely never dispatched |
| BLOCKED | 11 | **7 are `BLOCKED_COMPUTE_NOT_APPROVED`** (the governor refusing paid compute — working as designed), 2 retry-limit, 2 runtime/evidence |
| SAFE_TO_RETRY | 7 | `NEEDS_FIX` — verifier rejected, repair pending |
| BLOCKED_OWNER | 5 | approval_required / awaiting Mason |
| COMPLETED | 2 | already `CERTIFIED_PASS` |

**Important correction to the audit narrative:** the queue is not stalled *purely* because timers
died. Seven tasks were deliberately blocked by the cost governor because autonomous paid compute
is OFF and no budget is set. That is the safety layer doing its job — and it means enabling
autonomy requires Mason to set budgets, not just fixing launchd.

Nothing was executed, retried, or dead-lettered from the real queue. Classification only, as instructed.

---

## NOT DONE (and why — no false claims)

| Item | Status | Reason |
|---|---|---|
| P0-3 Always-on watchdog | **BLOCKED** | Requires system supervision that does not currently function. Building it now would produce a watchdog that never starts. |
| P0-4 Fix Mac supervision | **DIAGNOSED, NOT FIXED** | Root cause is macOS-level, not a plist defect. Needs owner action. |
| P0-5 Heartbeat staleness | **PARTIAL** | Detection logic exists in `matter-registry` (`heartbeat_max_age_minutes: 60`, health states). The *automatic* checker is part of the blocked watchdog. |
| P0-6 Cost capture | **NOT DONE** | Governor correctly still blocks paid autonomy. Budgets remain unset — **and setting them is explicitly Mason's decision**, per the spec. MTD still reports UNKNOWN (never $0). |
| P0-8 Dispatch cutover prep | **NOT STARTED** | Correctly gated on Codex re-verification of `51c362cb…`, which is still pending. |
| P0-9 Reboot test | **NOT RUN** | Requires restarting the Mac — kills this session and every running service. **Needs explicit authorization.** |
| P0-10 Failure tests | **PARTIAL** | Lease/DLQ/duplicate/permanent/approval paths proven (11/11). Network-loss and provider-unavailable rerouting need the dispatcher, which is gated on P0-8. |
| 24-hour soak | **NOT RUN** | Cannot pass a soak while automatic scheduling is dead — there is nothing to tick. |
| Matter Health V1 page | **NOT BUILT** | Deliberately deferred: a health page fed by services that cannot run would display a comforting lie. |

---

## OWNER ACTIONS REQUIRED (nothing below can be done from code)

1. **Approve the background agents.** System Settings → General → **Login Items & Extensions** →
   *Allow in the Background* — enable the Party Perfect / launchd items. This is the prime suspect
   for total scheduling failure. After that, re-run the 30-second control test; if it fires,
   scheduling is restored and the watchdog becomes buildable.
2. **Authorize the reboot test** (P0-9). It will terminate this session, the iMessage bridge, the
   intake worker and the OpenClaw gateway. I will not restart the Mac without you saying so.
3. **Set budgets** (P0-6): daily / monthly / per-provider. Paid autonomous compute stays OFF until
   you do — that gate is working correctly and I have not touched it.

## Recommended sequence once scheduling works

1. Re-run the control-plist test → confirm timers fire.
2. Build the watchdog as a **persistent daemon** (internal loop; `reclaim()` + heartbeat staleness
   + service liveness), supervised by launchd `KeepAlive` — verify respawn with `kill -9`.
3. Re-adopt the orphaned intake worker under launchd.
4. Cost telemetry + budgets → then, and only then, consider enabling paid autonomy.
5. Codex re-verify V1 → P0-8 cutover → 24-hour soak.

## Files added this cycle (additive; `control-plane.mjs` untouched)

- `AI-HANDOFF/matter/execution.mjs` — leases + DLQ substrate
- `AI-HANDOFF/matter/test-execution.mjs` — 11 failure tests
- `AI-HANDOFF/MATTER_P0_STATUS.md` — this report
