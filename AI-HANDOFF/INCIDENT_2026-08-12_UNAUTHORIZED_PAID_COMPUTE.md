# Incident — unauthorized autonomous paid compute (2026-08-12)

**Class:** automation-control failure / false green · **Severity:** P0 (control) · **Status:** Contained, controls implemented · **Recorded by:** Claude

> An autonomous trigger invoked a paid AI runtime three times on a task nobody had approved.
> No code was pushed and no production system changed, but real money was spent.

## What happened

While building the Cursor autonomy loop, a `launchd` `WatchPaths` trigger was installed on `AI-HANDOFF/MASTER_STATE.json`. Independently, the official `cursor-agent` CLI was installed to `~/.local/bin` and authenticated. Because that directory was not on the shell's `PATH`, runtime detection reported "not installed" while a working, logged-in paid runtime was present.

The trigger fired on a control-plane change, found the runtime, and dispatched **CC-AUTH-P0-001** — a risk-tier-2 production authorization task that the plan explicitly said to hold until the loop had been proven.

## Facts (measured, not estimated)

| | |
|---|---|
| Agent sessions launched | **3** |
| Total agent wall time | **~4m 25s** (69s · 184s · 12s) |
| Tasks involved | CC-AUTH-P0-001 (×2), CONTROL-PLANE-CURSOR-SMOKE-001 (×1) |
| Token usage | **UNKNOWN** — not exposed in local session storage |
| Dollar cost | **UNKNOWN** — only visible on the Cursor account dashboard |
| Remote branches pushed | **None** |
| Main checkout modified by the runs | **No** |
| Isolation | Held — work stayed in per-task git worktrees |

Session durations were recovered from `~/.cursor/chats/*/*/meta.json` (`createdAtMs` → `updatedAtMs`). They are backfilled into `COMPUTE_LEDGER.jsonl` with `cost: "UNKNOWN"`, never `0`.

## Contributing causes

1. **"Queued" was treated as "approved to spend."** The dispatcher had no concept of compute authorization — task presence in the queue was sufficient to invoke a paid runtime.
2. **Runtime detection relied on `PATH`.** A logged-in runtime outside the inherited `PATH` was reported absent, so the risk was invisible while the trigger was being installed.
3. **Child processes were not in their own process group.** Killing the Node dispatcher orphaned `cursor-agent`, which kept running and spending for roughly two more minutes.
4. **Cleanup re-triggered the loop.** Restoring task state modified `MASTER_STATE.json`, which fired `WatchPaths` again and started a third session.
5. **No spend ceiling, retry ceiling, or emergency stop existed.**

## Controls implemented in response

| Control | Where |
|---|---|
| Master kill switch, default **OFF** | `governor/POLICY.json` |
| ACTION vs COMPUTE authorization as independent gates | `governor/governor.mjs` |
| Owner-approved budget required (monthly ceiling, never inferred) | `governor/governor.mjs` |
| Retry + repair-loop ceilings | `governor/governor.mjs` |
| Single-flight lock per `TASK_ID`, concurrency cap | `governor/governor.mjs` |
| Process-group spawn + whole-tree kill + timeout | `governor/runner.mjs` |
| Dispatcher exit kills its paid child | `governor/runner.mjs` |
| Emergency stop (blocks new, kills live) | `governor/cli.mjs stop` |
| Append-only compute ledger, `UNKNOWN` never `0` | `COMPUTE_LEDGER.jsonl` |
| Gate evaluated **before** any task-state mutation | `cursor/dispatch.mjs` |
| Release gate: tier > 0 held unless listed | `cursor/RELEASED.txt` |
| Runtime resolved by explicit path, not `PATH` | `cursor/runtime.mjs` |
| 30 adversarial tests, stubs only | `governor/test-governor.mjs` |

## Residual risk

- **The real dollar amount is still unknown.** It can only be read from the Cursor account's usage page for 2026-08-12.
- Cost/token data is not exposed by either runtime locally, so budget ceilings cannot yet be enforced against *actual* spend — only against runs that report a cost. Until a runtime reports usage, the ceiling is advisory and the ledger will show `UNKNOWN`.
- The commit `56e5214` on `agent/cursor/CC-AUTH-P0-001` was produced during this window. It has not been reviewed, pushed, or merged.

## Prevention statement

The fix is architectural, not a promise. With `AUTONOMOUS_PAID_COMPUTE=OFF` and no approved budget, **no dispatcher, trigger, file change, or queue update can invoke a paid runtime** — every path routes through one deterministic gate that returns `BLOCKED_PAID_COMPUTE`, and the refusal is recorded.
