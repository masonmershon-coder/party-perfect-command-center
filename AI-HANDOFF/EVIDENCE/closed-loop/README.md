# Closed-loop evidence — HISTORICAL

Each file here records a single closed-loop execution **on its stated `executed_at`**.

> These are **historical audit artifacts, not current runtime state.**
> A passing check dated 2026-08-18 says nothing about reachability today.
> Re-run the probe before treating any of it as current.

## Reading these files

| Field | Meaning |
|---|---|
| `task_id` / `message_id` | the durable task and inbound message that triggered the run |
| `executed_at` | **the only date these results describe** |
| `method` | how the check ran — read-only by construction |
| `checks[]` | per-target HTTP status, latency, reachability *at that moment* |
| `digest` | content hash over the recorded result |

## The rule these artifacts exist to uphold

**A blocked verification is not a pass.**

When a verification cannot complete — verifier unavailable, policy acknowledgement stale,
capability untrusted, evidence missing, compute unapproved — the task is **BLOCKED** and
must render the specific gate code (e.g. `VERIFIER_POLICY_STALE`,
`VERIFIER_NO_PERMISSION`, `VERIFIER_CAPABILITY_UNTRUSTED`). It must never be silently
downgraded to a generic error, and never recorded as success.

A task marked `CERTIFIED_PASS` with no verifier, no evidence and no timestamp is a
**false green**, not a pass.

## Index

| File | Executed | What it proves — as of that date only |
|---|---|---|
| `MTR-76C41903.json` | 2026-08-18 | a deterministic read-only HTTP closed loop completed; two targets answered 200 |
