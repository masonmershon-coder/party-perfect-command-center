# CURRENT TASK

**TASK ID:** KITUWA-V2-REPAIR  
**STATUS:** `READY_FOR_CLAUDE_REVIEW`  
**UPDATED:** 2026-08-17  
**BRANCH:** `agent/cursor/KITUWA-V2-REPAIR` (worktree `~/.pp-worktrees/KITUWA-V1`)

## Done this slice

Matter Tower + truthful V2 contract on Kituwa worktree:

- `POST /api/matter/messages` — idempotent `client_message_id`, immediate ack (`message_id`, `task_id`, `conversation_id`, status)
- `GET /api/matter/tasks/:taskId` — full task detail, events, rejected workers, subtasks
- Durable records: `kituwa/records-v2.json` (Blob) alongside legacy `kituwa/state.json`
- Routes + nav: Home, Tower, Tasks, Projects, Memory, System (+ Settings, Offline)
- Matter entity (not Kituwa ghost), Tower floors with state-driven scenes, acknowledgment panel
- Health metrics with source/freshness; registry workers on System page
- Mobile CSS: 44px targets, nav, landmarks, reduced-motion
- Service worker: `public/kituwa/sw.js`
- Tests: `scripts/test-kituwa.mjs` + auth matrix pass; `tsc --noEmit` clean

## Not done / blocked

- **Preview deploy only** — not promoted to production (await Codex verify)
- Voice mode visualization — not approved for live test
- Live worker execution — still BLOCKED without fresh heartbeat (correct)
- PWA install prompt — thin follow-up
- `/agents` page — optional

## Holds (unchanged)

`PAID_AUTONOMY=OFF` · `LIVE_V2=OFF` · `POR_WRITE=BLOCKED` · no fake RUNNING workers

Evidence: `AI-HANDOFF/EVIDENCE/KITUWA_MASON_LIVE_SCORECARD_2026-08-17.md`
