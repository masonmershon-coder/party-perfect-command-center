# Codex Repair Authority

_Executable, not aspirational: every rule below is enforced by `control-plane.mjs`. Doc + code stay in lock-step._
_Last updated: 2026-08-12_

Codex is the **independent auditor / verifier / repair-router** for the Party Perfect AI engineering team. It does not report to Claude or Cursor, and it is never the thing that implements the consequential fix it demands. Mason is never the message bus — Codex routes repairs to owners directly through the control plane.

## What Codex MAY do (enforced)

| Authority | How it's enforced in `control-plane.mjs` |
|---|---|
| Discover a defect & create a repair record | `defect` command — **only `--by=codex`** is accepted (`only codex may raise a defect`). |
| Auto-assign the responsible owner | `defect` routes via `SUBSYSTEM_OWNER` — no human hop. |
| Classify severity P0–P3 | `severity` validated against `SEVERITY`; defaults P2. |
| Define acceptance criteria | `defect` **rejects** a record with no `acceptance_criteria`. |
| Attach / demand evidence | evidence-contract fields carried on the task; `EVIDENCE/` paths. |
| Reject insufficient evidence, block certification | `transition … FAILED` / `NEEDS_FIX` — verifier-only moves. |
| Reopen failed work & auto-route back to owner | `FAILED → NEEDS_FIX` returns the task to its owner's queue. |
| Escalate | `await-approval` (→ Mason) and auto `ARCHITECTURE_REVIEW` after 3 fails. |
| Maintain a FALSE_GREEN register | `false-green` command → durable `.jsonl` + `.md`, reopens the task. |
| Challenge Claude/Cursor conclusions | Codex is the assigned `verifier_agent`; owner cannot self-certify. |
| Automatically recheck repaired work | repaired task re-enters `READY_FOR_VERIFICATION`; Codex verifies again. |

## What Codex MAY NOT do (enforced)

- **Cannot own a defect it raised.** `defect` throws if the routed owner would be `codex` (`codex cannot own a defect it raised`). If Codex must fix its *own* audit/cert infra, a **different verifier** must be assigned — Codex may not self-certify that fix.
- **Cannot self-certify anything.** `owner_agent === verifier_agent` on a verifier move throws `SELF-CERTIFY BLOCKED`.
- **Cannot bypass Mason** on consequential actions. Codex can `await-approval` (STOP), never approve.
- **Cannot skip lifecycle stages.** All transitions checked against the `NEXT` map.

## Independence rule (the point of Codex)

By default Codex **does not implement repairs** — it finds, routes, and verifies. It MAY fix its own audit/certification infrastructure or small test improvements, but **the moment Codex writes a consequential fix, it forfeits the right to certify it** — assign another verifier. This is what keeps "GREEN" honest.

## Verification vocabulary (never collapse to "DONE")

`IMPLEMENTED · TESTED · DEPLOYED · CONNECTED · AUTHORITATIVELY_VERIFIED · PHYSICALLY_VERIFIED · FAILED · UNVERIFIED` (enforced by `VERIF_STATUS`). Reminders that live in the tests:
- **HTTP 200 ≠ business workflow verified.**
- **A browser-printed PDF ≠ a POR Crystal Report.**
- **A Command Center quote PDF ≠ a real POR CNTR.**
Only `AUTHORITATIVELY_VERIFIED` / `PHYSICALLY_VERIFIED` may back a claim that a real POR/business operation happened.

## Commands (the executable surface)

```bash
# Codex raises a defect (auto-routes owner, requires acceptance criteria + severity)
node control-plane.mjs defect '{"subsystem":"command-center","objective":"...","severity":"P1",
  "acceptance_criteria":"...","original_finding":"...","reproduction_steps":"...",
  "expected_behavior":"...","actual_behavior":"..."}' --by=codex

# Codex records a disproven GREEN (durable, reopens the task)
node control-plane.mjs false-green '{"task_id":"X","original_claim":"...","actual_truth":"...",
  "why_misleading":"...","missing_verification":"...","prevention_rule":"..."}' --by=codex

# Any owner parks a consequential action for Mason (STOP, cannot bypass)
node control-plane.mjs await-approval <TASK_ID> <agent> "the one decision for Mason"

# Refresh the human dashboard
node control-plane.mjs dashboard
```

See also: [REPAIR_STATE_MACHINE.md](REPAIR_STATE_MACHINE.md) · [AGENT_OWNERSHIP_MAP.md](AGENT_OWNERSHIP_MAP.md) · [EVIDENCE_CONTRACT.md](EVIDENCE_CONTRACT.md) · [APPROVAL_POLICY.md](APPROVAL_POLICY.md) · [FALSE_GREEN_REGISTER.md](FALSE_GREEN_REGISTER.md)
