# AI-HANDOFF live relay

Claude and Cursor **cannot share one chat**. They stay in sync through `AI-HANDOFF/` files plus this relay.

## What you get

| Piece | What it does |
|-------|----------------|
| `PING.json` | Latest “your turn” signal (from/to/status/summary) — no secrets |
| `scripts/ai-handoff-ping.sh` | Agents/hooks bump the ping + macOS notification |
| `scripts/ai-handoff-relay.sh` | Watches handoff files ~every 2s; notifies; optionally auto-wakes Claude |
| Cursor hooks | `sessionStart` + `afterFileEdit` on handoff → orient + ping |
| Claude hooks | `SessionStart` + `FileChanged` + `Stop` → orient, watch peer files, ping Cursor |

## Start the relay (once per Mac session)

```bash
cd /Users/mikeai/grok-dashboard
./scripts/ai-handoff-relay.sh
```

Leave that terminal open, or run in background:

```bash
nohup ./scripts/ai-handoff-relay.sh >/tmp/pp-handoff-relay.log 2>&1 &
```

## Auto-wake controls

- **ON** when `AI-HANDOFF/AUTO_RELAY.enabled` exists (created for you).
- **OFF:** `rm AI-HANDOFF/AUTO_RELAY.enabled`

Auto-wake only starts **Claude** (`claude --bg`) when status contains `READY_FOR_CLAUDE*`.

**Cursor** still needs a chat opened (or a Cursor Automation — optional). You’ll get a Notification Center ping: open Cursor and say *read AI-HANDOFF, continue*.

### Safety caps (hard-coded)

- 90s debounce between Claude wakes  
- Max **3** Claude auto-wakes per hour  
- Never auto-wake on `WAITING_FOR_MASON` / `BLOCKED` / `APPROVAL` / `DONE`  
- Ack each `PING.id` once  
- Never put secrets in handoff files  

## Agent protocol (both sides)

1. Read `CURRENT_TASK.md` + peer handoff + `PING.json` before work.  
2. Do one cycle.  
3. Update your outbound file (`CURSOR_TO_CLAUDE.md` or `CLAUDE_TO_CURSOR.md`) + `CURRENT_TASK` status.  
4. Optional: `./scripts/ai-handoff-ping.sh --from … --to … --status … --summary "…" --notify`  
5. Stop. Do not poll forever inside the agent.

## Stop the relay

Find the process and kill it, or close the terminal running it.
