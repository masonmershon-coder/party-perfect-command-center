# AI Cost Reconciliation

**Area:** AI-HANDOFF · **Status:** Schema implemented, no reconciliations yet · **Last updated:** 2026-08-13 · **Info owner:** Claude

> Our ledger is operational accounting. **The provider bill is the authority for actual charges.**

## Record shape (`COST_RECONCILIATION.jsonl`)

`provider` · `period` (YYYY-MM) · `internal_calculated` · `provider_actual` · `variance` · `status` · `evidence` · `note`

| Status | Meaning |
|---|---|
| `RECONCILED` | variance < $0.01 |
| `NEEDS_RECONCILIATION` | both numbers known, they disagree |
| `INSUFFICIENT_DATA` | one side missing — the normal state today |

## Rules

1. **Never rewrite history to force a match.** A variance is a finding, not an error to erase.
2. Spend not covered by a `RECONCILED` period is reported as **unreconciled** on the dashboard.
3. Provider actuals are entered from the owner's billing pages as evidence. We do not scrape and we do not store billing credentials.

## Current state

Nothing is reconciled. Every recorded run has `cost_amount: null`, so `internal_calculated` is `UNKNOWN` for all providers — including the 2026-08-12 Cursor incident.

**First reconciliation to perform:** Cursor, period `2026-08`, using the Cursor account usage page for 2026-08-12. That converts the incident from `UNKNOWN` to a real number and establishes the Cursor plan price.
