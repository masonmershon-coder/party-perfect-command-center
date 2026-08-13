# Owner Dashboard API Contract

**Area:** AI-HANDOFF · **Status:** Backend implemented, UI not built · **Last updated:** 2026-08-13 · **Info owner:** Claude

> The single payload the Owner page and Matter both read.
> Producer: `node AI-HANDOFF/governor/dashboard.mjs --json` (`schema_version: 1`).
> **Cursor builds the UI against this payload and must not recompute any number.**

## Placement

`COMMAND CENTER → OWNER → AI COST & CONTROL`, alongside the existing owner-gated sections (Bookkeeping, Marketing, Reports). It must live inside the existing Owner UI architecture — not a separate app.

## Payload

```
generated_at, schema_version
headline {
  today, this_week, this_month,               // pre-formatted strings, may read "UNKNOWN (n runs)"
  projected_month, projected_basis, projected_confidence,
  known_fixed_monthly, fixed_source, fixed_verified_against_provider,
  variable_compute, unreconciled,
  monthly_budget, budget_remaining            // "NOT CONFIGURED" until Mason sets one
}
providers { <provider>: { fixed_subscription, fixed_verified, variable_usage_month,
                          runs_month, unknown_cost_runs, last_usage, status } }
agents    { <agent>:    { runs, successful, failed, retries, compute_seconds,
                          tokens, cost, cost_per_successful_task } }
projects  { <project>:  { display, known_total, known_runs, unknown_runs, runs } }
live_activity [ { runtime, agent, task_id, pid, started_at, runtime_seconds,
                  cost_so_far, authorization, budget_status } ]
guardrails { paid_compute, emergency_stop, daily_budget, monthly_budget,
             budget_utilization, compute_approved_tasks, limits,
             blocked_attempts, recent_guardrail_events[] }
incidents  [ { incident_id, type, severity, occurred_at, summary, status,
               cost, cost_classification } ]
waste      [ { type, task_id?, agent?, evidence_rows, summary, avoidable_cost } ]
reconciliation [ ... ]
blind_spots [ string ]     // what this payload CANNOT tell you
```

## UI rules (non-negotiable)

1. **Render money strings verbatim.** They already encode `UNKNOWN (3 runs)` and `$2.50 + 1 UNKNOWN`. Do not parse them to a number and do not substitute `$0`.
2. **`blind_spots` must be visible on the page**, not hidden behind a tooltip. It is the honesty surface.
3. `NOT CONFIGURED` is a real state — never render it as `$0.00`.
4. Fixed vs variable are shown separately and never summed into one headline figure.
5. `live_activity` should feel observable — a running paid agent must be visible while it runs.
6. Guardrail state (`ARMED` / `DISARMED`) belongs above the fold.

## Matter query layer

`node AI-HANDOFF/governor/dashboard.mjs --answer "<question>"`

Handles: today · this week · this month / projected · unauthorized runs · which agent costs most · waste · POR project · Cursor · budget. Anything else returns a capability statement rather than a guess. **Matter must never compute a dollar figure itself.**
