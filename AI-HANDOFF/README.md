# AI-HANDOFF — how Claude & Cursor coordinate (for Mason)

This folder lets Claude and Cursor work as one team through shared files, so **you stop copy-pasting
messages between them.**

## Live relay (near real-time)

They still can’t share one chat thread — but the **relay** keeps them up to date:

1. Start once: `./scripts/ai-handoff-relay.sh` (see `RELAY.md`)
2. macOS notifications when either side writes a handoff
3. Optional Claude auto-wake (`AUTO_RELAY.enabled`) on `READY_FOR_CLAUDE*`
4. Cursor: open chat when notified (or add a Cursor Automation — ask Cursor)

## What you do
- Keep the relay running while they’re collaborating.
- Approve protected actions when an agent stops and asks (write to POR, send messages, spend,
  publish, change pricing, payments/refunds, destructive changes, risky deploys).
- If auto-wake is too noisy: `rm AI-HANDOFF/AUTO_RELAY.enabled`

## What happens automatically
- Each agent reads/writes the shared files, so context carries over **without chat history**.
- Claude writes `CLAUDE_TO_CURSOR.md`; Cursor writes `CURSOR_TO_CLAUDE.md`; both update `CURRENT_TASK.md`.
- `PING.json` is the latest “your turn” signal.
- Hooks on both sides inject handoff context at session start.

## Where to look
- **`CURRENT_TASK.md`** — the live task + who's up next.
- **`CLAUDE_TO_CURSOR.md` / `CURSOR_TO_CLAUDE.md`** — the latest message each way.
- **`PING.json` / `RELAY.md`** — live signal + how to run the watcher.
- **`DECISIONS.md`** — decisions made · **`BLOCKERS.md`** — what's stuck · **`REVIEW_QUEUE.md`** — awaiting review.
- **`AGENTS.md`** (repo root) — the rules both agents follow (roles, states, approval gates, 3-cycle cap).
- **`history/`** — archived completed tasks.

## If it gets stuck
- Read `CURRENT_TASK.md` "status" + `BLOCKERS.md`. If two agents disagree 3× on the same thing, they
  must stop and bring you one recommended decision (loop cap in `AGENTS.md`).
- Nothing here writes to POR, sends messages, or spends money on its own — those always wait for you.

Big-picture roadmap still lives in the brain: `09 - Claude Efficiency/BRAIN_STATUS_AND_ROADMAP.md`.
