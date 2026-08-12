# Shared Evidence Contract

_The minimum a repair/verification record must carry. Fields live on the task in `MASTER_STATE.json` (see `TASK_FIELDS`). No vague "fixed" / "done."_
_Last updated: 2026-08-12_

## Required fields

| Field | Meaning |
|---|---|
| `task_id` | Stable identity across the whole lifecycle. |
| `subsystem` | Routes the owner (see [AGENT_OWNERSHIP_MAP.md](AGENT_OWNERSHIP_MAP.md)). |
| `owner_agent` | Who implements. |
| `verifier_agent` | Who certifies (default `codex`; never == owner). |
| `severity` | `P0` / `P1` / `P2` / `P3`. |
| `original_finding` | What Codex first observed. |
| `evidence_paths` | Files under `EVIDENCE/` (diffs, logs, outputs). |
| `reproduction_steps` | How to reproduce the defect. |
| `expected_behavior` / `actual_behavior` | The gap, concretely. |
| `acceptance_criteria` | What "fixed" concretely means — **required to raise a defect**. |
| `files` | Files changed. |
| `tests_run` / `test_results` | What was run and the outcome. |
| `deployment_status` | Where it actually runs (if anywhere). |
| `verification_status` | The controlled vocabulary below — **not** "done". |
| `remaining_uncertainty` | What is still unproven. |

## Verification status vocabulary (enforced by `VERIF_STATUS`)

`IMPLEMENTED · TESTED · DEPLOYED · CONNECTED · AUTHORITATIVELY_VERIFIED · PHYSICALLY_VERIFIED · FAILED · UNVERIFIED`

A bad value is rejected at the `transition`/`create` boundary. Escalation ladder of proof:

- `IMPLEMENTED` — code exists.
- `TESTED` — a test passed **locally**.
- `DEPLOYED` / `CONNECTED` — it runs / is wired to a real dependency.
- `AUTHORITATIVELY_VERIFIED` — checked against the **system of record** (e.g. real POR CNTR / Crystal Report), not a look-alike.
- `PHYSICALLY_VERIFIED` — a human/physical confirmation (paper ticket, printer output).

### What does NOT count as proof
- **HTTP 200** — not a business-workflow verification.
- **Local JSON / a local DB row** — not a real POR operation.
- **A browser-printed PDF** — not a POR Crystal Report.
- **A Command Center quote PDF** — not a real POR CNTR.
- **"task completed"** — meaningless without the fields above.

## Setting the fields via the engine

```bash
node control-plane.mjs transition <TASK_ID> <verifier> CERTIFIED_PASS \
  --verification_status=AUTHORITATIVELY_VERIFIED \
  --tests_run="por-verifier 7/7 vs CNTR 100000-100002" \
  --test_results="pass" --deployment_status="read-only bridge" \
  --remaining_uncertainty="none for read path" \
  --evidence=EVIDENCE/<TASK_ID>.result.md
```

## Secrets

Secret **values** are rejected anywhere in a task record (`assertNoSecrets` / `SECRET_RE`). Reference `secret_store:<name>` only.
