# AI Control Plane — operating manual (Claude · Codex · Cursor)

Deterministic shared task/evidence system so **Mason is never the message bus.** Engine: `control-plane.mjs` (no LLM, no secrets). Authoritative machine state: `MASTER_STATE.json`. Append-only audit: `TASK_QUEUE.jsonl`. Also: `RESULTS.jsonl`, `BLOCKERS.jsonl`, `APPROVALS.jsonl`, `HEARTBEATS.json`, `EVIDENCE/`. Markdown = human-readable only.

## The one loop
```
NEW → CLAIMED → IN_PROGRESS → READY_FOR_VERIFICATION → VERIFYING → CERTIFIED_PASS
                                     ↑                         ↓
                             (owner reclaims) ← NEEDS_FIX ← FAILED
```
**The executor can NEVER certify its own work** — the engine blocks `CERTIFIED_PASS`/`FAILED`/`VERIFYING` unless the actor is the task's `verifier_agent` and is not the `owner_agent`.

## Commands (each agent runs these; the watcher tells you what to do)
```bash
cd AI-HANDOFF
node control-plane.mjs watch <agent>            # <- START HERE: what YOU must act on now
node control-plane.mjs list                     # whole board
node control-plane.mjs claim <task_id> <agent>
node control-plane.mjs transition <task_id> <agent> <STATUS> [--claim=.. --evidence=path1,path2 --unverified=a,b --next=.. --error=..]
node control-plane.mjs block <task_id> <agent> "<reason>" [--escalate=mason|agent]
node control-plane.mjs approve <task_id> <by> "<scope>"
node control-plane.mjs heartbeat <agent> <STATE> [<task_id>] [<blocked_reason>]
```

## Ownership (deterministic routing by `subsystem`)
- **claude:** por · enterprise · counter · rds · crystal · printer · bridge · observer · legacy
- **cursor:** product · frontend · backend · api · command-center
- **codex:** audit · verification · certification · security · regression
A wrong-agent `claim` is rejected. A Codex finding on Command-Center code files a `cursor` task; on POR/runtime files a `claude` task.

## Handoff rule (spec #3/#4)
Never say "done." Move the task to `READY_FOR_VERIFICATION` with `--claim`, `--evidence`, and `--unverified`. Codex auto-picks it up via `watch codex`, tries to **disprove** it, then sets `CERTIFIED_PASS`, or `FAILED`→`NEEDS_FIX` (which routes back to the owner's `watch`). No Mason relay.

## Secrets (spec #17)
Task records may NOT contain secret values — the engine rejects `postgres://`, `DATABASE_URL=`, api keys, `Bearer …`, `OWNER_PIN=`, `AUTH_PASSWORD=`, etc. Reference a store instead: `"secret_store":"partyperfect-database-url"`.

## Approval tiers (spec #12) — record on the task; don't re-ask for pre-approved classes
- **TIER 0** read-only → automatic · **TIER 1** local reversible → automatic+log · **TIER 2** internal non-customer write → policy · **TIER 3** POR/customer/business write → **approval required** · **TIER 4** destructive/security/money → **Mason mandatory**.

## Blocker escalation (spec #11)
`block` with `--escalate` mentioning login/2fa/password/physical/business-rule/approval/vendor routes to **mason**; otherwise it stays for another agent to pick up. Don't send Mason technical dumps — file a `BLOCKED` task.

## Heartbeats (spec #10)
Each agent keeps `HEARTBEATS.json` current (`current_task`, `state`, `last_seen`). Surfaced in `DASHBOARD.md` (and later `/matter`).

## Watching cheaply (spec #7)
Poll `watch <agent>` on a low interval or a filesystem-change trigger on `MASTER_STATE.json`. Do NOT have agents continuously converse; wake only when `watch` shows work.
