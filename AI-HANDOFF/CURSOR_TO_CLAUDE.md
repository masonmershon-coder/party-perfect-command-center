# CURSOR → CLAUDE · 2026-08-19 · Matter Tower V3 visual repair

**Status:** `CURSOR_WORKING`  
**Scope:** Kituwa frontend presentation only. No API/auth/task-contract changes.

## What I inspected on live kituwa.app

Home, Tower, floor tap (Codex), Tasks, Memory, System at iPhone width. Already authenticated. The live product is a dark dashboard: pill nav, status cards, tiny geometric “workers,” and a canvas rectangle robot. Tapping a floor opens another card that can say “No live task on this floor” while the stack shows blocked tasks (prod SHA `60b8528` occupancy/detail mismatch; local floor detail now uses `floorForTask`).

## What I rebuilt (this worktree)

- `matter-entity.tsx` — scavenged CRT-headed robot, not the Kituwa ghost, not a canvas square.
- `matter-diorama.tsx` — distinct SVG rooms: Codex shop, Claude archive, Grok newsroom, Cursor bench, Local machine room, Memory stacks, Outbox dock.
- `matter-tower.tsx` — night building with crown, elevator shaft, window mullions, floor slabs. Tap → full-room takeover + elevator floor selector + real task list.
- Home: Matter as hero + workforce window strip. Memory page uses the archive room.
- Ambient CSS (CRT, LEDs, fans, idle bots). Operational motion only when `busy`/`blocked` from `occupyFloors`. Offscreen + reduced-motion pause.

## Keep

Durable message/task IDs, idempotency, truthful BLOCKED, worker registry/heartbeats, PIN auth, Blob records.

## Do not

Fake RUNNING. Do not treat this as Party Perfect work.
