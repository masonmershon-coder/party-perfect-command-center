# Cost and permission governor — read-only audit

**Date:** 2026-09-30 · **Branch:** `claude/MATTER-FRESHNESS-EVIDENCE-CLEANUP`
**Base:** `agent/matter-core-alpha` @ `c509783`
**Method:** source reading and state inspection only. No permission granted, no compute
activated, no credential touched, no production contacted.

---

## Summary

| Severity | Count | |
|---|---:|---|
| **P0** | 2 | control plane bypasses the trust gate; two live false greens |
| **P1** | 2 | trust authority unconfigured; provider-name routing still authoritative |
| **P2** | 3 | budget not committed; DLQ unmonitored; ack staleness only checked on sensitive work |
| **OK** | 6 | self-grant, self-certification, reporter authority, retry limit, owner escalation, fail-closed compute |

The **Matter layer is sound**. The **control plane in front of it is not wired to it.**
That gap is the whole of finding F1.

---

## What is correctly enforced

**Workers cannot self-grant permissions.** `matter-registry.mjs:84` — registration takes
`permissions: prev.permissions ?? {}`, never the caller's. `grantPermission()` requires a
`MATTER_TRUST_AUTHORITY_TOKEN` and **fails closed** when none is configured
(`"no authority token configured (fail closed)"`), logging `PERMISSION_GRANT_DENIED`.

**Workers cannot self-certify.** `checkIndependentVerification()` enforces **18 distinct
fail conditions**: `NO_VERIFIER`, `SELF_CERTIFICATION`, `VERIFIER_UNREGISTERED`,
`VERIFIER_UNAVAILABLE`, `VERIFIER_HEARTBEAT_STALE`, `VERIFIER_POLICY_STALE`,
`VERIFIER_NO_PERMISSION`, `VERIFIER_NO_CAPABILITY`, `VERIFIER_CAPABILITY_UNTRUSTED`,
`TASK_UNKNOWN`, `NOT_ASSIGNED_VERIFIER`, `NO_EVIDENCE`, plus nonce replay/expiry/
mismatch/launcher-identity conditions.

**Outcome reporting is authority-checked.** `UNAUTHORIZED_REPORTER` and
`NOT_TASK_EXECUTOR` reject outcomes from anyone but the recorded executor.

**Compute is gated at six layers**, all deny-by-default: `EMERGENCY_STOP`, `MASTER_OFF`,
`NO_BUDGET`, `NOT_APPROVED`, `ACTION_NOT_AUTHORIZED`, `BUDGET_EXCEEDED`, plus
`RETRY_LIMIT`.

**Retries are bounded.** `MAX_ATTEMPTS` default 3, `DEFAULT_TTL_SEC` 300, terminal states
`SUCCEEDED | FAILED_PERMANENT | DEAD_LETTER`, with an append-only `DEAD_LETTER.jsonl`.

**Owner escalation exists.** `owner_approval_required` on protected actions;
`WAITING_FOR_OWNER_APPROVAL` reachable from `IN_PROGRESS` and `VERIFYING`.

---

## Findings

### F1 — P0 · The control plane never calls the trust gate

`AI-HANDOFF/control-plane.mjs` contains **zero references** to `trust.mjs` or
`checkIndependentVerification`. Every gate listed above is reachable only through the
Matter registry path. The control plane transitions a task to `CERTIFIED_PASS` on actor
identity alone — it does not require evidence, an assignment record, verifier permission,
or capability trust.

**Impact:** the 18-condition gate is decorative for any task that moves through the
control plane. Verification is a convention there, not an enforced property.

**Repair:** call `checkIndependentVerification()` from the `READY_FOR_VERIFICATION` and
`CERTIFIED_PASS` transitions and reject on failure with the gate code. Acceptance test
already exists: `AI-HANDOFF/test-control-plane-gaps.mjs` (published on
`claude/brain-live-por-001`) fails 5/5 by design and turns green when this is wired.
No permission change required.

### F2 — P0 · Two tasks are CERTIFIED_PASS with no verifier

From `MASTER_STATE.json` (historical state, dated by that file — not re-probed):

| Task | `verified_by` |
|---|---|
| `CODEX-ACCESS-SMOKE-001` | `null` |
| `COMMAND-CENTER-EE42DA` | `null` |

`CODEX-ACCESS-SMOKE-001` is the task whose only purpose was to prove the verifier can
reach the repository. It is marked passed and was never run. Everything downstream
inherits that assumption.

**Impact:** the system's belief that verification works is itself unverified.

**Repair:** reset both to `NEEDS_FIX`, re-run under the gate once F1 lands. Do not
hand-edit them to `CERTIFIED_PASS`. A pass produced without a verifier is not a pass.

### F3 — P1 · `MATTER_TRUST_AUTHORITY_TOKEN` is configured nowhere but tests

Present only in `test-trust-v12.mjs` and `test-matter-registry.mjs`. Absent from
`.env.example`.

**Impact:** fail-closed, so nothing unsafe happens — but **no permission can ever be
granted operationally**, including legitimate ones. Any capability requiring a permission
is permanently unreachable outside tests.

**Repair:** document the variable in `.env.example` as a required operational secret
(name only, never a value), define who holds it, and record grants in an append-only log.
Do not place a value in the repository.

### F4 — P1 · Provider-name routing is still the executor

`control-plane.mjs` routes by a `SUBSYSTEM_OWNER` map hard-coding provider names. The
capability router (`matter-registry.route()`) runs in **shadow only** — `shadow-router.mjs`
records `legacy_is_executor: true`, `v2_executed: false`.

**Impact:** `AGENTS.md`'s foundational rule — *Matter owns the jobs; providers are
replaceable workers* — is not in force for real work.

**Repair:** keep shadow mode, compare decisions over a sample, and cut over per-subsystem
only after the shadow router agrees on a meaningful run. Not a same-day change.

### F5 — P2 · No owner-approved budget is committed

No budget file exists in the repository; `AUTONOMOUS_PAID_COMPUTE` is absent from
`.env.example`. Five tasks sit at `BLOCKED_COMPUTE_NOT_APPROVED`: `POR-STAT-VERIFY-001`,
`POR-KITS-VERIFY-001`, `CERT-HARNESS-VERIFY-001`, `CONTROL-PLANE-CURSOR-SMOKE-001`,
`PP-SEC-001`.

**Impact:** no worker can be dispatched to paid compute. This is the single gate on
Codex's entire queue. It is **deliberate** and correct after the 2026-08-12 unauthorized-
compute incident.

**Repair:** owner decision only. Set daily and monthly ceilings and per-task approvals.
Claude must not set these.

### F6 — P2 · Dead-letter queue has no monitor

`DEAD_LETTER.jsonl` is append-only and nothing reads it. A task that exhausts
`MAX_ATTEMPTS` lands there and is never surfaced.

**Repair:** include a DLQ count in `CORE_HEALTH.json` and escalate to owner review at a
threshold. Low effort, no permission change.

### F7 — P2 · Policy-ack staleness is only checked on sensitive work

`matter-registry.mjs:314` checks `policy_version_ack` only when a task is protected or
needs verification. A worker on a stale policy can execute ordinary work indefinitely.

**Repair:** report ack staleness in health output for all workers even where it does not
block routing, so drift is visible before it blocks something.

---

## Repair order (none granted here)

1. **F1** — wire the control plane to the trust gate. Highest value, no permission change,
   acceptance test already written.
2. **F2** — reset the two false greens; re-verify under the gate.
3. **F3** — document the authority variable and its holder.
4. **F6, F7** — health-output additions.
5. **F5** — owner budget decision.
6. **F4** — provider-neutral cutover, per subsystem, after shadow agreement.

---

## Boundaries observed

No permission granted. No compute activated. No budget set. No credential read, reset or
inspected. No task status modified. No production, POR, SQL or Redis contact. State
figures come from committed files and are historical as of their file dates — they are
**not** re-probed runtime proof.
