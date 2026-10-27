# Matter phone gateway and iOS client

Date: 2026-10-27
Branch: `cursor/matter-ios-phone-slice-119d`
Base: `origin/agent/matter-core-alpha` at `c509783`

## Audit

`560585c` is not on `origin`. The published alpha tip is `c509783` (`matter: seed policy into core data root safely`). The 55% intake evidence that exists on the Mac mini's unpushed branch is not in this clone, so it was not re-verified here and those commits were not rewritten.

This machine is a Linux x86_64 cloud agent, not Mason's Mac mini. It cannot see the live launchd supervisor, the 4 TB SSD, or an iPhone.

No Swift project existed. Kituwa already has session-gated web routes under `app/api/kituwa/*` and `app/api/matter/*`. Those stay on the Party Perfect app. The phone gateway is a separate localhost process so this slice does not deploy kituwa.app.

## What was tested

`node AI-HANDOFF/matter/test-core-alpha.mjs` passed. The published supervisor exited after its first health write on Node 22 because the keep-alive timer was `unref()`'d and a pending top-level await no longer holds the process. The timer is referenced again. The alpha test now requires the process to still be running and the health pid to match.

`node AI-HANDOFF/matter/test-phone-api.mjs` passed against a temporary data root. It checked:

- missing token, short token, public bind, and missing data root fail closed
- unauthenticated health does not reveal the supervisor
- a harmless task is stored as `QUEUED` with `executed: false`
- protected language stays `WAITING_APPROVAL` even if the client sends `SAFE`
- `POST /v1/tasks/:id/execute` returns 403
- approve records `READY` and does not execute
- reject records `BLOCKED` and a conflicting second decision returns 409
- registry workers are not marked available unless supervisor health says so
- gateway restart and a supervisor start/stop leave `PHONE_TASKS.json` in place
- while the fixture supervisor was running, health reported that pid and `running: true`; after SIGTERM, `running` and `supervisor_healthy` were false

## Not tested

No iPhone was installed. `swift` and `xcodebuild` are absent. There is no Apple signing identity here. No request from a phone reached a Mac mini.

## Contract v2 follow-up

The first gateway wrote `PHONE_TASKS.json` and accepted a client `classification` field. That conflicted with the Core ledger. Version 2 writes phone tasks through `execution.mjs` into `LEASES.json` and rejects `classification`. `node AI-HANDOFF/matter/test-phone-api.mjs` passed after that change, including a private TLS listener, `session_expired`, a refused public bind, and supervisor restart leaving the ledger task in place. `test-execution.mjs` stayed at 11 passed. `test-core-alpha.mjs` passed.

Swift Mission Control, Face ID / device passcode before approvals, and `MatterTests/ContractTests.swift` are in the Xcode project. They were not compiled. `swift` and `xcodebuild` are absent. The install checklist is `ios/Matter/FIRST_DEVICE_CHECKLIST.md`.

## Checkpoint reading

This does not move the Mac mini off its local 55% record. On the published alpha line, the new piece is an authenticated phone gateway plus an unsigned SwiftUI client.

- 60%: run this gateway on the Mac mini against the real data root and confirm the live supervisor pid through `GET /v1/health`.
- 65%: install the app on Mason's iPhone with a development team and complete one real create-task round trip.
- 70%: restart the live supervisor and show the same phone task still listed, including one approval that stays unexecuted until Mason decides it on the device.
