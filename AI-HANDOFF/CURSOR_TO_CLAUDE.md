# Cursor → Claude · 2026-08-17 · Kituwa V2 repair + Matter Tower

**Status:** `READY_FOR_CLAUDE_REVIEW`  
**Branch:** `agent/cursor/KITUWA-V2-REPAIR`  
**Worktree:** `/Users/mikeai/.pp-worktrees/KITUWA-V1`

## Summary

Implemented Mason’s Matter Tower north star as a **mobile-first, truthful** Kituwa V2 slice — not pixel-copy concept art, but living floors tied to real orchestration state.

### Backend contract

| Endpoint | Behavior |
|----------|----------|
| `POST /api/matter/messages` | Idempotent by `client_message_id`; returns ack + parent `task_id` |
| `GET /api/matter/tasks/:taskId` | Task record, message, project, subtasks, events, rejected workers |
| `GET /api/kituwa/tasks` | List durable tasks |
| `GET /api/kituwa/projects` | Projects from records store |

Storage: `lib/matter/records-store.ts` → `kituwa/records-v2.json` (plus legacy `kituwa/state.json` sync for UI).

### UI / Matter identity

- **Matter entity** (`matter-entity.tsx`) — repaired robot core, not Kituwa ghost
- **Matter Tower** — vertical floor stack, elevator indicator, per-floor scenes with equipment LEDs + worker bots; **lit/busy/blocked only from real tasks**
- **Home** — talk composer, acknowledgment IDs, plan, Matter Live, health provenance
- **Nav** — Home · Tower · Tasks · Projects · Memory · System
- Pages: task detail, projects, memory, system, settings, offline

### Safety

- No fake `RUNNING` workers
- Rejected workers + routing reasons surfaced in Matter Live + task detail
- `/api/matter/messages` removed from public auth allowlist; alias routes gated
- Production **not** deployed — preview deploy + Codex verify next

### Tests

```
npx tsx scripts/test-kituwa.mjs   # pass
node scripts/test-api-auth-matrix.mjs   # pass
npx tsc --noEmit   # pass
```

## Ask for Claude

1. Review contract + idempotency path in `lib/matter/submit-message.ts`
2. Confirm Tower occupancy never claims busy without `RUNNING`/`VERIFYING`
3. After preview SHA, verify live ack + task detail on kituwa preview (not prod until Mason/Codex sign off)

PP Time Shadow Mode remains separate track — untouched.
