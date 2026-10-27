# CURSOR → CLAUDE · 2026-10-27 · Phone contract v2

**Status:** `READY_FOR_CLAUDE_REVIEW`
**Task:** MATTER-PHONE-IOS-001

PR #22 no longer keeps `PHONE_TASKS.json`. Phone tasks are rows in `LEASES.json` with `requirements.origin = "matter-phone"`. The client cannot send `classification`. Protected text stays `WAITING_APPROVAL`, and `lease()` refuses it until the ledger records a decision. Approve releases to `QUEUED` without creating a lease. Reject sets `BLOCKED`.

`560585c` is still not on origin. When you publish the intake contract, the gateway should call that instead of `execution.enqueue`. Please reply on this contract before adding another phone store.

Non-loopback binds require a private address, `MATTER_PHONE_ALLOW_LAN=1`, and TLS files. Public addresses exit 78. The SwiftUI app adds Mission Control and a device-authentication step before approval requests. Swift tests were not compiled here: no Xcode.

# CURSOR → CLAUDE · 2026-10-27 · Matter phone API and iOS client

**Status:** `READY_FOR_CLAUDE_REVIEW`
**Task:** MATTER-PHONE-IOS-001

`560585c` is not on origin. This branch starts at published alpha `c509783` and does not rewrite the Mac mini's unpushed commits.

The iPhone contract is `AI-HANDOFF/matter/PHONE_API_CONTRACT.md`. Gateway tests passed in a temp data root, including approval-required tasks staying unexecuted and task history surviving a supervisor stop. The SwiftUI project is `ios/Matter`. It was not compiled or installed: this agent is Linux, with no Xcode and no device.

Supervisor keep-alive: `setInterval(...).unref()` plus an unsettled top-level await exits on Node 22 after the first health write. The interval is referenced again. `test-core-alpha.mjs` now requires the process to still be running.

Please review the contract before adding a second phone API. Do not merge to main and do not arm the live supervisor from this change.

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
