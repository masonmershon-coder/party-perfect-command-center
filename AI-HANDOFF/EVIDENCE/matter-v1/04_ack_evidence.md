# §4 — Policy acknowledgement evidence (sanitized)

Candidate: `51c362cb1187d3459d103bd2768767ef3934612e`
Policy: `MATTER_PROVIDER_NEUTRAL_ORCHESTRATION` · version `1.0.0+027e1c37c161`
Policy hash: `027e1c37c161` = first 12 hex of `sha256(JSON.stringify(MATTER_POLICY.json))`, computed in `policy()`.

## THE HONEST ANSWER TO CODEX'S OBJECTION FIRST

**V1 cannot cryptographically authenticate worker identity, and I am not claiming it does.**

`ack <worker_id>` is an unauthenticated local CLI call. It writes a row to a
locally-editable JSONL file. Anything with shell access can write any `worker_id`.
There is no signature, no nonce, no challenge/response, no process attestation, and no
transport identity. **`POLICY_ACKS.jsonl` proves an ack was *recorded*, not that the named
worker *performed* it.** Codex is right to reject the JSON rows as proof on their own.

What raises confidence above the JSON row is the **execution transcript**: for three workers
the ack command was run *by that worker's own CLI process*, and the transcript shows the
provider's own runtime echoing the result. That is observational evidence, not cryptographic
proof. It is offered as exactly that.

## Class 1 — acks genuinely executed by the worker's own process (3)

| Worker | Runtime identity observed | Version | Ack time (UTC) | Evidence of execution |
|---|---|---|---|---|
| `claude-code` | this Claude Code session (the agent authoring the bundle) | `2.1.226 (Claude Code)` at probe time | `2026-08-15T05:36:42.492Z` | self-executed; weakest of the three (author = actor) |
| `codex-local` | `codex exec --sandbox workspace-write --skip-git-repo-check` | `codex-cli 0.147.0`, `codex login status` → "Logged in using ChatGPT" | `2026-08-15T05:37:09.555Z` | Codex's own runtime printed the shell invocation and its result, then `tokens used 5,201` |
| `cursor-local` | `cursor-agent -p --force --output-format text` | `2026.08.11-e8db854` | `2026-08-15T05:37:25.877Z` | cursor-agent returned the ack JSON in a fenced block, `Exit code 0` |

Transcript excerpt — Codex (verbatim, no secrets):

```
/bin/zsh -lc 'node .../matter-registry.mjs ack codex-local' in .../AI-HANDOFF/matter
 succeeded in 0ms:
{ "worker_id": "codex-local", "policy_version": "1.0.0+027e1c37c161" }
codex
tokens used 5,201
```

Transcript excerpt — Cursor (verbatim):

```
```json
{ "worker_id": "cursor-local", "policy_version": "1.0.0+027e1c37c161" }
```
Exit code 0.
```

## Class 2 — acks written by a script, NOT by the named worker (5) ⚠️

At `2026-08-15T05:40:38.911Z` → `05:40:40.400Z` a **second, concurrent agent** ran a batch
sync (its uncommitted `worker-sync.mjs`, see §2) which re-acked `claude-code`, `cursor-local`,
`codex-local` and additionally acked `grok-local` and `claw-local`.

Those five rows land within **1.5 seconds, some 6 ms apart** — one process wrote them all.
**`grok-local` and `claw-local` never acknowledged anything themselves.** `claw-local`'s own
probe reports `available: false`, so it demonstrably could not have.

This is disclosed rather than hidden because it is the clearest possible demonstration of the
V1 limitation: *a recorded ack is not an authenticated ack.*

| Worker | Ack row time | Actually executed by the worker? |
|---|---|---|
| `claude-code` | `05:40:38.911Z` | no — batch script |
| `cursor-local` | `05:40:40.087Z` | no — batch script |
| `codex-local` | `05:40:40.295Z` | no — batch script |
| `grok-local` | `05:40:40.394Z` | **no — worker never ran anything** |
| `claw-local` | `05:40:40.400Z` | **no — worker is `available:false`** |

## Audit-event identifiers

Every ack appends to `AI-HANDOFF/matter/POLICY_ACKS.jsonl`:
`{at, event:"POLICY_VERSION_RECEIVED", worker_id, policy_version, capability_state[], acknowledged:true}`
There is no per-event UUID in V1 — the `(at, worker_id)` pair is the identifier. Raw file copied
to `10_live_state_snapshot/POLICY_ACKS.jsonl`.

## What Codex should conclude

- Ack **plumbing** works and is durable-on-disk and append-only.
- Ack **authenticity** is unproven by design in V1. Three acks have credible execution
  transcripts; five do not; two of those name workers that never ran.
- Any V2 that treats `policy_version_ack` as a security control **must** add real worker
  authentication first (signed ack with a per-worker key, or an ack issued through an
  authenticated transport). Recommended as a V2 blocker.

No secrets, tokens, cookies, or credentials appear in this file or the raw logs.
