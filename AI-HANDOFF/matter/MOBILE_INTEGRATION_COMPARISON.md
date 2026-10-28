# Matter mobile integration comparison

Visual follow-up, not a second app: `ios/MatterKit` on `cursor/matter-living-presence-119d` is a SwiftUI presence and family home that can be placed in front of Claude's client. It does not replace `e041ad5`, and it does not describe Claude's Family Mode. States come from `matterPresence(_:)`. The kit does not classify work or call the network.



Date: 2026-10-27 (7:00 PM America/Chicago)
Branch under review: `cursor/matter-ios-phone-slice-119d` (PR #22, open, not merged)
Base: `origin/agent/matter-core-alpha` at `c509783`

## What this environment could see

Claude's authoritative branches were not on origin and are not in this clone:

- `agent/matter-mobile-api` commit `83e9c21` — no remote ref, object not present
- `agent/matter-ios-app` commit `e041ad5` — no remote ref, object not present

There is no Family Mode type, screen, or string in this tree. This document does not describe Claude's Family Mode, intake routes, approval journal, or device-auth design. Those stay on the unpublished branches. Do not reimplement them here.

The shared goal remains one Matter iPhone app, one authenticated Matter API, and one successful physical-iPhone test. None of those three is done. This agent did not compile Swift, run a simulator, or connect to the Foundry Mac mini.

## Feature comparison

| Area | In this PR | Claude's unpublished app | Integration note |
|---|---|---|---|
| App | `ios/Matter`, SwiftUI, iOS 17, bundle `app.kituwa.matter`, unsigned | `agent/matter-ios-app` @ `e041ad5`, reported simulator-tested | One app. Keep Claude's. Mine behaviors from this PR after that source is visible. |
| API | `phone-api.mjs` contract v3: read ledger/health, forward intake and approvals or return 503 | `agent/matter-mobile-api` @ `83e9c21`, reported pinned HTTPS against the live supervisor | One API. Claude's service is the authority. This gateway must not become a second one. |
| Intake | Forwards `{client_message_id, text, source}` only when `MATTER_INTAKE_URL` is set. Otherwise 503 `intake_required`. No classifier. | Not visible | Body shape is a proposal. Confirm against `83e9c21` before wiring the URL. |
| Approvals | Forwards `{task_id, decision, note}` only when `MATTER_APPROVAL_URL` is set. Otherwise 503 `approval_journal_required`. No `release` or `block`. | Not visible | Journal writes belong to Claude. |
| Execution | `POST /v1/tasks/:id/execute` is always 403 | Not visible | Keep the refusal until Claude's execution control is the only path. |
| Mission Control | Live only when the latest refresh succeeded and the screen is not showing a saved snapshot. Supervisor pid is hidden otherwise. `supervisor_healthy` requires a health file, a running pid, and `last_pass_at` within 90 seconds. | Not visible | Port the live-versus-snapshot rule if `e041ad5` does not already have it. |
| Family Mode | Absent | Reported on Claude's app, source not readable | Do not add a Family Mode screen to `ios/Matter`. |
| Face ID | `LAContext.deviceOwnerAuthentication` before approve or reject is sent. Bearer token still required. `NSFaceIDUsageDescription` is set. | Not visible | Keep Claude's device-auth mechanism if it differs. This check does not authorize the task. |
| Offline | Connection states: checking, online, offline, unauthorized, session expired. Cache is labeled and is not a live supervisor. Queue, workers, and local intelligence say so when the snapshot is saved. | Not visible | Port the distinct session-expired state and the cache captions. |
| Local intelligence | `available` is true or false only when `CORE_HEALTH.json` lists the worker. Otherwise null. Probe commands and Ollama-style URLs are removed. | Not visible | Keep this redaction on whichever API the phone calls. |
| Transport | Loopback HTTP allowed. Other binds require a private IP, `MATTER_PHONE_ALLOW_LAN=1`, and TLS files. `0.0.0.0`, `::`, and public IPs exit 78. App Transport Security allows local networking only. | Reported pinned HTTPS | Confirm the pin and host rules against `83e9c21`. Do not add `NSAllowsArbitraryLoads`. |

## Incorporate into Claude's app

After `e041ad5` and `83e9c21` are available, bring these behaviors across if they are missing there:

- Mission Control and Settings show supervisor pid, running, and healthy only for a live response. A saved snapshot stays labeled not live, including queue counts, workers, and local intelligence.
- Authenticated health is healthy only when the health file exists, its pid is running, and the last pass is within 90 seconds.
- Worker availability is null when that worker is absent from supervisor health. Do not return probe commands or local model endpoints.
- HTTP 401 `session_expired` is separate from a bad token and from a network failure.
- Private-bind refusal for `0.0.0.0`, `::`, and public addresses, with TLS required off loopback.
- Face ID or device passcode before the approval request leaves the phone, if Claude's screen does not already gate it. Server authentication stays mandatory.
- Keychain item `app.kituwa.matter` / `phone-token` with `AfterFirstUnlockThisDeviceOnly`.
- Task rows still decode when `classification`, route, and routing basis are null.
- A successful intake or approval response that is not the old task envelope is treated as accepted. The phone does not invent a ledger status.
- Node 22 supervisor keep-alive in `core-alpha.mjs`: the interval stays referenced so the process does not exit after the first health write. The alpha test requires the child to still be running.

## Discard

Do not ship these as a second Matter system:

- `ios/Matter` as a parallel app once `e041ad5` is the app under test.
- `PHONE_TASKS.json`. It is already gone.
- Any phone-side or gateway-side task classifier, including the removed regex that wrote `SAFE` and `WAITING_APPROVAL`.
- Local approve, reject, `release`, and `block` from the phone gateway.
- `execution.annotate`. It was added on this branch to store approval fields and has been removed. Nothing calls it.
- A Family Mode built from guesswork.
- Treating contract version 2's "the server classifies and writes the ledger" as current. Version 3 replaces that write path.
- The earlier checkpoint that called a create-task round trip through this gateway the next 65% step.

## Conflicts for Claude's review

1. PR #22 still contains both `ios/Matter` and `phone-api.mjs`. Leave it open and unmerged. Merging it beside `e041ad5` would create two apps.
2. The forward bodies are guessed. Intake receives `client_message_id`, `text`, and `source`. Approvals receive `task_id`, `decision`, and `note`. The operator supplies the full upstream URL. Confirm those fields against `83e9c21` before setting `MATTER_INTAKE_URL` or `MATTER_APPROVAL_URL`.
3. `GET /v1/tasks` and `GET /v1/conversations` list only ledger rows with `requirements.origin` equal to `matter-phone`. Claude's intake rows will be invisible if they use another marker.
4. `GET /v1/approvals` is derived from `LEASES.json` state. If the approval journal is a different store, this list can be empty while a decision is still pending.
5. `core-alpha.mjs` on this branch changes keep-alive behavior. Unpublished Mac history, including `560585c`, may edit the same supervisor. Review that hunk before it lands on the mini.
6. `execution.mjs` is back to the published alpha text after `annotate` was removed. If `83e9c21` also edits that file, diff it directly. Do not revive `annotate` as a side journal.
7. This app's device check is local `LAContext` biometrics or passcode. If Claude's device authentication is a pinned credential or a different API, keep that and do not replace it with this Face ID call.
8. No physical iPhone test, simulator run, or Mac mini request is claimed from this environment.
