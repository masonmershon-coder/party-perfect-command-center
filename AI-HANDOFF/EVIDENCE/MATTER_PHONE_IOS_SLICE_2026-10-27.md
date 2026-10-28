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

This does not move the Mac mini off its local 55% record. The version 2 paragraphs above describe an earlier write path. Contract version 3 supersedes it: this gateway no longer classifies tasks or records approvals.

The next shared goal is one Matter iPhone app, one authenticated Matter API, and one physical iPhone test. Claude's `83e9c21` and `e041ad5` were not available here, so this evidence does not claim that test.

## Contract v3 coordination

`node AI-HANDOFF/matter/test-phone-api.mjs` passed at 2026-10-28T00:03:38Z (7:03 PM America/Chicago) after the write path was removed. A create with no intake URL returns 503 `intake_required` and does not create `LEASES.json`. An approval with no journal URL returns 503 `approval_journal_required`. A `classification` field is 400 `unknown_field`. A loopback intake double receives the text without a classification, and the gateway still does not write the ledger. A public `http` intake URL exits 78. An unreachable intake returns 502 `upstream_unreachable`. Seeded ledger rows remain observable, execute stays 403, and a supervisor stop leaves those seeded rows in place. `execution.annotate` was removed. `node AI-HANDOFF/matter/test-execution.mjs` and `node AI-HANDOFF/matter/test-core-alpha.mjs` were rerun after that removal.

Swift was not compiled. No simulator run and no Mac mini connection is claimed for this pass. The feature split is `AI-HANDOFF/matter/MOBILE_INTEGRATION_COMPARISON.md`.
