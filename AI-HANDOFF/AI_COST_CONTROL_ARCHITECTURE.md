# AI Cost Control Architecture (AI-COST-CONTROL-001)

**Area:** AI-HANDOFF · **Status:** Implemented (backend), UI pending · **Last updated:** 2026-08-13 · **Info owner:** Claude

> One ledger, one gate, one dashboard contract. No accounting silos, no LLM arithmetic.

## Flow

```
task created (control-plane.mjs)
   ↓
COMPUTE GOVERNOR  governor/governor.mjs   ← deterministic; runs BEFORE any state mutation
   ↓ ALLOWED                              ↘ BLOCKED_* → recorded in COMPUTE_LEDGER
paid runtime spawned  governor/runner.mjs  ← process group, timeout, single-flight
   ↓
usage event → COMPUTE_LEDGER.jsonl (normalized, idempotent by event_id)
   ↓
aggregation  governor/accounting.mjs      ← UNKNOWN never collapses to $0
   ↓
Owner payload  governor/dashboard.mjs     ← the single API contract
   ↓
Command Center → Owner → AI Cost & Control   (Cursor builds this: AI-COST-DASHBOARD-001)
Matter query layer                            (answers only from the payload)
```

## Modules

| File | Role |
|---|---|
| `governor/governor.mjs` | the gate + policy + locks + emergency stop |
| `governor/runner.mjs` | the ONLY place a paid runtime is spawned |
| `governor/accounting.mjs` | normalized events, aggregation, fixed costs, reconciliation, incidents, waste |
| `governor/dashboard.mjs` | Owner payload + Matter answers |
| `governor/verified-stop.mjs` | STOP_CONFIRMED vs STOP_UNVERIFIED |
| `governor/cli.mjs` | owner controls (`status`, `stop`, `on`, `off`, `approve`, `ledger`) |
| `COMPUTE_LEDGER.jsonl` | central append-only ledger |
| `COST_INCIDENTS.jsonl` · `COST_RECONCILIATION.jsonl` | incident + reconciliation records |

## Two authorizations, never conflated

**ACTION** — may this task deploy / write production / touch POR / send messages?
**COMPUTE** — may this task consume paid AI resources?

Purchases (new subscriptions, upgrades, payment details) **always** require Mason and are never delegated. Metered compute *may* eventually run autonomously inside a budget Mason approves. Neither gate implies the other; both are tested in both directions.

## Every path to paid compute (audited 2026-08-13)

| Path | Gated? |
|---|---|
| `cursor/dispatch.mjs` | YES |
| `codex/verify.mjs` | YES |
| `runtime/workers/cursor-worker.mjs` | YES — *was ungated; found and fixed 2026-08-13* |
| `runtime/local-dispatcher.mjs` → workers | YES (via the worker gate) |
| `app.pp.cursor-dispatch` launchd | **DISARMED** (was RunAtLoad + 180s poll, ungated) |
| `com.partyperfect.cursor.dispatch` | removed |
| `com.partyperfect.codex.dispatch` | removed |
| `codex.daily` / `codex.weekly` sweeps | deterministic; call no model |

## Lean-AI principle

The monitoring system spends nothing during normal operation: selection, routing, aggregation, reconciliation, waste detection and the dashboard are all plain code. The only paid call in the system is the agent doing actual engineering work.
