# §8 — Durability of V1 state (honest labels)

Candidate: `51c362cb1187d3459d103bd2768767ef3934612e`

**Summary: V1 is FILE-BACKED. Nothing in V1 is DURABLE in a transactional sense.** There is no
database, no fsync discipline, no locking, no transaction, no replication, and no restart
recovery logic. Two of the five stores are MUTABLE and can be rewritten or hand-edited; three
are APPEND-ONLY by construction but still plain local files.

| Store | File | Label | Why |
|---|---|---|---|
| Registry | `AI-HANDOFF/matter/WORKER_REGISTRY.json` | **FILE-BACKED · MUTABLE** | Whole file rewritten via `writeFileSync` on every `register`/`heartbeat`/`probe`/`ack`. Last writer wins. No locking → a concurrent writer can clobber. Hand-editable. |
| Policy | `AI-HANDOFF/matter/MATTER_POLICY.json` | **FILE-BACKED · MUTABLE (integrity-checked)** | Plain editable JSON, but the version is `semver + sha256(content)[0:12]`, so **any edit mints a new version** and previously-recorded acks no longer match. Tamper-evident, not tamper-proof. |
| Acknowledgements | `AI-HANDOFF/matter/POLICY_ACKS.jsonl` | **FILE-BACKED · APPEND-ONLY** | Only ever `appendFileSync`. No code path rewrites or deletes rows. The file itself is still deletable/editable outside the program. |
| Heartbeats / probes | (inside `WORKER_REGISTRY.json`) | **FILE-BACKED · MUTABLE · EPHEMERAL** | `last_heartbeat`, `last_probe`, `available`, `latency_ms` are overwritten in place. **No history is retained** — the previous probe result is lost on the next probe. Only capability *changes* survive, in the audit log. |
| Outcomes | `AI-HANDOFF/matter/WORKER_OUTCOMES.jsonl` | **FILE-BACKED · APPEND-ONLY** | Append-only; the sole input to `scoreFor()`. |
| Audit trail | `AI-HANDOFF/matter/ROUTING_DECISIONS.jsonl` | **FILE-BACKED · APPEND-ONLY** | Every `ROUTING_DECISION` and `CAPABILITY_CHANGE_DETECTED`. |

## Restart / crash semantics — stated, not assumed

- **Survives process restart:** yes, all five files are on local disk and re-read on next call.
- **Survives host restart:** yes, same reason (no in-memory-only state, no daemon).
- **Atomicity:** **none.** `writeFileSync` is not atomic; a crash mid-write can truncate
  `WORKER_REGISTRY.json`. There is no temp-file+rename, no fsync, no journal.
- **Concurrency:** **unsafe.** No advisory lock. Two processes calling `register()` concurrently
  will lose one another's writes (read-modify-write on the whole file).
- **Backup/replication:** none in V1.

### Concurrency weakness is not theoretical — it happened during this evidence pass

While assembling this bundle, a **second agent** ran its own (uncommitted) `bootstrap-workers.mjs`
/ `worker-sync.mjs` against the same live directory and rewrote `WORKER_REGISTRY.json`: it added
`grok-local` and `claw-local` and re-wrote the ack fields at `05:40:40Z`. My earlier probe values
were overwritten in place with no record of the prior values.

That is precisely the MUTABLE/EPHEMERAL behaviour tabled above, observed live. It is disclosed
because it materially affects how much weight Codex should place on the registry snapshot:

- the **append-only** logs (`POLICY_ACKS`, `ROUTING_DECISIONS`, `WORKER_OUTCOMES`) retain both
  agents' events and are therefore the trustworthy record;
- the **registry snapshot** shows only the most recent writer's view.

## What this means for the V2 cutover

Do **not** treat V1 file state as a system of record for anything consequential. Before V1
selection drives live dispatch, V2 needs at minimum: atomic writes (temp+rename+fsync), an
advisory lock or single-writer process, and authenticated acks (§4). These are recommendations
from this evidence pass — **no such change has been made to the candidate.**
