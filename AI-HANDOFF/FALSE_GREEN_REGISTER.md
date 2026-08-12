# FALSE GREEN REGISTER

Durable record of GREENs that were **not real** — a task that was reported passing/done when the underlying business or system operation had not actually happened. Append-only; written by `control-plane.mjs false-green`. Recording a false green also flips the referenced task's `verification_status` back to `UNVERIFIED` and marks `false_green:true`, so it re-enters the queue.

Each entry captures: **task · original claim · actual truth · why it was misleading · the missing verification · the prevention rule · subsystem · repair status.**

Purpose: every false green must yield a **prevention rule** so the same misleading signal can't pass again (e.g. "require an authoritative POR CNTR check, not an HTTP 200"). See [EVIDENCE_CONTRACT.md](EVIDENCE_CONTRACT.md) for what does and does not count as proof.

```bash
node control-plane.mjs false-green '{"task_id":"X","subsystem":"command-center",
  "original_claim":"quote PDF generated so it works",
  "actual_truth":"no POR CNTR was created",
  "why_misleading":"a Command Center PDF is not a POR contract",
  "missing_verification":"authoritative POR CNTR lookup",
  "prevention_rule":"CERTIFIED_PASS on POR paths requires AUTHORITATIVELY_VERIFIED"}' --by=codex
```

<!-- entries appended below -->
