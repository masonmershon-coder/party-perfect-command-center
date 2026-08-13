# AI Cost / Automation Incidents

**Area:** AI-HANDOFF · **Status:** 2 open/closed records · **Last updated:** 2026-08-13 · **Info owner:** Claude

> Machine-readable: `COST_INCIDENTS.jsonl`. Types: `UNAUTHORIZED_COMPUTE` · `RUNAWAY_AGENT` · `RETRY_LOOP` · `DUPLICATE_WORK` · `BUDGET_EXCEEDED` · `STOP_UNVERIFIED` · `PROVIDER_COST_UNKNOWN` · `RECONCILIATION_MISMATCH` · `UNGATED_COMPUTE_PATH`

## INC-EE8D79D7 — UNAUTHORIZED_COMPUTE (P0)

2026-08-12. Three unintended `cursor-agent` sessions launched by an ungated launchd trigger — two on **CC-AUTH-P0-001** (tier 2, explicitly held), one on the smoke task.

Measured: **3 sessions, 265s total** (69s · 184s · 12s). Tokens **UNKNOWN**. Dollars **UNKNOWN**. No remote push; main checkout unmodified.

Status: `OPEN_PENDING_PROVIDER_RECONCILIATION`. **If the dashboard ever displays this as `$0`, the accounting system has failed.** It is the permanent regression test for that.

## INC-84B70211 — UNGATED_COMPUTE_PATH (P0)

2026-08-13. Discovery found a **second** dispatcher — `runtime/local-dispatcher.mjs` driven by the `app.pp.cursor-dispatch` launchd agent — invoking `cursor-agent` with **zero** governor calls, armed with `RunAtLoad` and a **180-second poll**. Yesterday's governor only gated the dispatchers I had written.

Controls: trigger disarmed and archived to `~/Library/LaunchAgents/.disarmed-2026-08-13/`; `cursor-worker.mjs` now calls `authorizePaidCompute` before spawning and exits `BLOCKED` — verified.

Status: `CLOSED_CONTROL_ADDED`.

**Lesson:** a governor only governs the paths that call it. Any new paid path must be audited into the table in `AI_COST_CONTROL_ARCHITECTURE.md`.
