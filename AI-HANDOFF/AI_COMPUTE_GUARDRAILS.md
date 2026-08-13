# AI Compute Guardrails

**Area:** AI-HANDOFF · **Status:** Implemented, DISARMED · **Last updated:** 2026-08-13 · **Info owner:** Claude

> Deterministic gate order. No LLM is ever asked whether another LLM may spend money.

## Gate order (`authorizePaidCompute`)

| # | Check | Block code |
|---|---|---|
| 1 | emergency stop engaged | `BLOCKED_EMERGENCY_STOP` |
| 2 | master switch OFF | `BLOCKED_PAID_COMPUTE` |
| 3 | no owner-approved budget | `BLOCKED_NO_BUDGET_APPROVED` |
| 4 | task lacks COMPUTE approval | `BLOCKED_COMPUTE_NOT_APPROVED` |
| 5 | task lacks ACTION approval (when required) | `BLOCKED_ACTION_NOT_AUTHORIZED` |
| 6 | monthly/daily ceiling reached | `BLOCKED_BUDGET_EXCEEDED` |
| 7 | retry ceiling exceeded | `BLOCKED_RETRY_LIMIT` |
| 8 | repair-loop ceiling exceeded | `BLOCKED_REPAIR_LIMIT` |
| 9 | single-flight lock / concurrency cap | `BLOCKED_ALREADY_RUNNING` |

The gate runs **before any task-state mutation** — a refused task stays exactly where it was rather than stranding in `IN_PROGRESS`.

## Runaway protection

Retry ceiling · repair-loop ceiling · single-flight lock per `TASK_ID` (pid-liveness aware, so a dead lock cannot wedge the queue) · max concurrent paid agents · hard timeout with whole-tree kill · dispatcher-exit kills its paid child · release gate holding anything above tier 0.

## Verified stop

A stop is `STOP_CONFIRMED` only when **all four** hold: target processes gone · no replacement worker appeared · respawn triggers disarmed · usage events stopped growing. Otherwise `STOP_UNVERIFIED`, and an incident is opened automatically.

This exists because on 2026-08-12 a kill was reported successful while the paid child kept running for ~2 minutes, and the cleanup itself re-triggered a third run.

## Budget framework

Daily / weekly / monthly, per provider / agent / project / task. Future states: `NORMAL` → `WARNING` → `THROTTLED` → `APPROVAL_REQUIRED` → `HARD_STOP`.

**All thresholds are `NOT CONFIGURED`.** The system never picks a dollar figure. Arming requires an explicit monthly ceiling:

```bash
node AI-HANDOFF/governor/cli.mjs on --by=mason --monthly=<amount> [--daily=<amount>]
```
