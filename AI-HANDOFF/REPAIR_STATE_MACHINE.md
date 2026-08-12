# Repair State Machine

_Enforced by the `NEXT` transition map + authority checks in `control-plane.mjs`. No stage may be skipped._
_Last updated: 2026-08-12_

## Happy path

```
NEW → CLAIMED → IN_PROGRESS → READY_FOR_VERIFICATION → VERIFYING → CERTIFIED_PASS
        (owner)     (owner)          (owner)              (codex)     (codex)
```

- Owner-side moves (`IN_PROGRESS`, `READY_FOR_VERIFICATION`, `BLOCKED`): only the `owner_agent`.
- Verifier-side moves (`VERIFYING`, `CERTIFIED_PASS`, `FAILED`, `NEEDS_FIX`): only the `verifier_agent`, and **never** if it also owns the task (self-certify block).
- `CERTIFIED_PASS` sets `verification_status = AUTHORITATIVELY_VERIFIED` unless the verifier states a narrower status.

## Failure path (auto-routed back to owner, no Mason hop)

```
VERIFYING → FAILED → NEEDS_FIX → (owner reclaims) → IN_PROGRESS → READY_FOR_VERIFICATION → VERIFYING …
```

Each failed verification increments `fail_count` **exactly once** per cycle.

## Repeated-failure policy (no infinite AI loops)

| Failure | Behaviour |
|---|---|
| **#1** | Return with defect + evidence + reproduction + acceptance criteria → `NEEDS_FIX` to owner. |
| **#2** | Same loop; owner is expected to add a regression test + tighter criteria. |
| **#3** | Engine **auto-escalates to `ARCHITECTURE_REVIEW`** (`fail_count ≥ 3`) — the loop stops. Logged to `BLOCKERS.jsonl` as `escalate:architecture`. A human/architecture decision is required before another retry. |

`ARCHITECTURE_REVIEW → { NEW, CLAIMED, WAITING_FOR_OWNER_APPROVAL }` — the only ways out.

## Other terminal / parked states

- `WAITING_FOR_WORKER` — owner has no autonomous runtime yet; never auto-fires.
- `WAITING_FOR_OWNER_APPROVAL` — consequential action parked for Mason (see [APPROVAL_POLICY.md](APPROVAL_POLICY.md)).
- `BLOCKED` — a genuine blocker (login/2FA/physical/business-rule/vendor keywords escalate to Mason).

## Full transition table (as coded)

```
NEW                        → CLAIMED, WAITING_FOR_WORKER
CLAIMED                    → IN_PROGRESS, NEW
IN_PROGRESS                → READY_FOR_VERIFICATION, BLOCKED, NEEDS_FIX, WAITING_FOR_OWNER_APPROVAL
READY_FOR_VERIFICATION     → VERIFYING
VERIFYING                  → CERTIFIED_PASS, FAILED, BLOCKED, WAITING_FOR_OWNER_APPROVAL
FAILED                     → NEEDS_FIX
NEEDS_FIX                  → CLAIMED, IN_PROGRESS, ARCHITECTURE_REVIEW
BLOCKED                    → IN_PROGRESS, CLAIMED
WAITING_FOR_WORKER         → CLAIMED
ARCHITECTURE_REVIEW        → NEW, CLAIMED, WAITING_FOR_OWNER_APPROVAL
WAITING_FOR_OWNER_APPROVAL → CLAIMED, IN_PROGRESS, NEW
CERTIFIED_PASS             → (terminal)
```

Any transition not in this table throws `illegal transition` — proven by the break-tests (e.g. `NEW → CERTIFIED_PASS` is rejected).
