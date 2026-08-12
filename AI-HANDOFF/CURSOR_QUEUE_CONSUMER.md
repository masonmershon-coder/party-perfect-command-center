# Cursor — Queue Consumer Contract

How the autonomous `cursor` worker consumes the shared control plane. Worker ID: **`cursor`**.

## Loop (per wake — narrow context, then stop)
```bash
cd AI-HANDOFF
node control-plane.mjs watch cursor          # what's mine?
node control-plane.mjs claim <TASK_ID> cursor
```
Then, for the claimed task:
1. Read **only** the task's `evidence_paths` + `PARTY_PERFECT_SYSTEM_TRUTH.md` (do NOT ingest the whole brain).
2. Create an **isolated** workspace: branch/worktree/cloud checkout `agent/cursor/<TASK_ID>`.
3. `transition <TASK_ID> cursor IN_PROGRESS`.
4. Implement the change.
5. Run **lint + typecheck + tests** (deterministic evidence; prefer tests over model judgment).
6. Commit; open a **draft PR**; write results to `AI-HANDOFF/EVIDENCE/<TASK_ID>.md` (files changed, tests + output, PR link, known limits).
7. `transition <TASK_ID> cursor READY_FOR_VERIFICATION --evidence=AI-HANDOFF/EVIDENCE/<TASK_ID>.md --claim="…"`.
8. `heartbeat cursor IDLE`; stop.

**Cursor may not set `CERTIFIED_PASS`.** Codex picks the task up via `watch codex`, audits the branch/PR + reruns tests, then `CERTIFIED_PASS` or `FAILED`→`NEEDS_FIX` (which routes back to Cursor's `watch`). No Mason relay.

## Subagents (internal Cursor specialists — not top-level agents)
Configure under Cursor as needed:
- `command-center-frontend` — React/UI/UX
- `command-center-api` — Next.js API / server auth
- `command-center-tests` — test harness / regression
- `command-center-security` — authorization / secrets / cache policy
- `por-compatibility` — Command-Center side of the POR adapter only (POR runtime stays Claude)

## Cost control
Event-triggered wake only (see `cursor-dispatch.mjs`); narrow per-task context via `evidence_paths`; never poll continuously; deterministic tests over model judgment.
