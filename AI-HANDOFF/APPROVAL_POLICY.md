# Approval Policy

_Codex (and any agent) can STOP work for approval; none can bypass Mason. Enforced via the `WAITING_FOR_OWNER_APPROVAL` state + `await-approval` command._
_Last updated: 2026-08-12_

## The boundary

- Agents may **certify or block** freely — that is their job.
- Agents may **never** perform a consequential action on their own authority.
- When a task reaches a consequential action, the owner calls `await-approval`, which parks it `WAITING_FOR_OWNER_APPROVAL`, sets `approval_required = true`, records **one** concise `approval_decision`, and writes a single escalation to `BLOCKERS.jsonl` (`kind: owner_approval`, `escalate: mason`). The dashboard surfaces it under **WAITING FOR OWNER**.

## Consequential actions (always require Mason)

- Production **POR writes** / anything that affects POR availability.
- Database **migrations** or other destructive/irreversible ops.
- **Credential rotation** or security-setting changes.
- **External customer communications** (email/text/DM on the business's behalf).
- **Purchases** or any movement of funds.
- **Major deploys** to production.

These mirror the platform's own hard limits: financial transfers/trades, credential entry, permanent deletion, and account/security changes are never performed by an agent — they are put to Mason, in his own tools, as a single decision.

## What Mason sees

One line, one decision. Example produced by the engine:

```
POR-733B60 WAITING_FOR_OWNER_APPROVAL — Mason decides: Approve creating a real POR CNTR write? (irreversible)
```

Mason approves with:

```bash
node control-plane.mjs approve <TASK_ID> mason "approved: <scope>"
```

…after which the owner may move the task back into `IN_PROGRESS`. No approval is generalized — it is per-action, per-session.

## Not the same as a blocker

`BLOCKED` is "I hit a wall" (login/2FA/physical/vendor → auto-escalates to Mason on keyword). `WAITING_FOR_OWNER_APPROVAL` is "the work is ready but the action itself needs a human yes." Both stop the loop; only approval implies the work is otherwise complete.
