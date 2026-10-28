# CURSOR → CLAUDE · 2026-10-27 · Family visual handoff

**Status:** `READY_FOR_CLAUDE_REVIEW`
**Task:** MATTER-PRESENCE-001

Your SwiftUI app remains the primary implementation. PR #22 stays open and unmerged. I did not add another phone gateway, another app target, or any NAS, media, or account backend. Matter Core and the approval gates were not touched.

`ios/MatterKit` now has seats, a home/work visual split, and a title-only shelf. `visiblePlaces` keeps work-only people out of the family chat. `MatterKeptShelf` shows titles and the word Private, with no picture and no storage path. The integration steps are `ios/MatterKit/INTEGRATION.md`.

Previews still use fixture names, not the real family. Xcode is not on this machine, so nothing was compiled or run in the simulator.

# CURSOR → CLAUDE · 2026-10-27 · The Wick

**Status:** `READY_FOR_CLAUDE_REVIEW`
**Task:** MATTER-PRESENCE-001

`e041ad5` is still not on origin, so I did not edit your SwiftUI app. `ios/MatterKit` is a separate package: a banked-flame presence, a conversation-first family home, and an owner screen for mission, approvals, tasks, agents, and health. `matterPresence(_:)` turns real signals into Idle, Listening, Thinking, Speaking, Working, Waiting, or Offline. A refresh is not thinking. Queued work is not working. Speech is only while the phone is playing audio.

Please drop this in front of your existing client when you want the new home. Keep your intake, approval journal, device authentication, and execution controls. Face ID stays the extra device check. The tabbed client on PR #22 was not switched over.

Xcode is not installed here. The studies in `ios/MatterKit/Studies` are browser paintings, not simulator captures.

# CURSOR → CLAUDE · 2026-10-27 · Mobile coordination, contract v3

**Status:** `READY_FOR_CLAUDE_REVIEW`
**Task:** MATTER-PHONE-IOS-001

`agent/matter-mobile-api` (`83e9c21`) and `agent/matter-ios-app` (`e041ad5`) are not on origin. This clone cannot diff them. PR #22 stays open and unmerged. No second app and no second classifier were added.

Contract version 3 stops this gateway from classifying text or writing approval decisions. `POST /v1/tasks` returns 503 `intake_required` unless `MATTER_INTAKE_URL` is set, then it forwards `{client_message_id, text, source}` unchanged. `POST /v1/approvals/:id` returns 503 `approval_journal_required` unless `MATTER_APPROVAL_URL` is set, then it forwards `{task_id, decision, note}`. Those bodies are a proposal. Please confirm them against `83e9c21` before anyone sets the URLs.

`execution.annotate` was removed. GET routes still observe `LEASES.json` and only list rows with `requirements.origin = matter-phone`, which will hide your intake rows if they use another marker. Family Mode is not in this tree and was not reimplemented.

The comparison of what to port, what to discard, and the merge conflicts is `AI-HANDOFF/matter/MOBILE_INTEGRATION_COMPARISON.md`. Swift was not compiled. No iPhone or Mac mini test is claimed.

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
