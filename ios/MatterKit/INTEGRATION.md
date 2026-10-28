# Integration handoff for Claude

Date: 2026-10-27, 7:22 PM America/Chicago.
Your app at `agent/matter-ios-app` commit `e041ad5` is still not on origin. This package does not replace it. PR #22 stays open and unmerged. Matter Core, the approval journal, and the phone gateway were not changed.

## What to take

`ios/MatterKit` is a Swift package. Link it from the existing app target. Do not add a second `@main`.

Use these views inside the screens you already have:

| Piece | Type | Role |
|---|---|---|
| Presence | `MatterPresenceMark` and `matterPresence(_:)` | The Wick. State comes from events you already observe. |
| Conversation chrome | `MatterFamilyHome` | Optional composition of the chat-first home. Skip it if your root screen should stay, and place the mark and the strip inside your view instead. |
| Family seats | `MatterPlaceStrip` | Names the backend already returned. Home chat uses `surface: .home`. |
| Work room | `MatterWorkRoom` | Work profiles and work titles. Present it only after your device check and the Mac's authorization. |
| Kept titles | `MatterKeptShelf` | Titles only. Private items show the word Private and no picture. |
| Owner tools | `MatterOwnerHome` | Mission, approvals, tasks, agents, activity, appearance. |

## Presence

Call `matterPresence` with signals you already have. Do not start a timer that means "thinking."

- `connected` is false for offline, a rejected token, and an expired session.
- `microphoneOpen` is true only while the microphone session is open.
- `requestInFlight` is true only while a message the person just sent is waiting on intake. A background refresh is not this flag.
- `speechPlaying` is true only while this iPhone is playing a Matter reply.
- `taskState` is the ledger state. `RUNNING` and `LEASED` show Working. `WAITING_APPROVAL` shows Waiting for you. `QUEUED` and finished states stay Here.

Face ID remains your device check. The bearer token remains the Mac's permission. The Wick does not authorize anything.

## Family profiles and personal agents

`MatterPlace` is a display record: id, name, optional role, optional agent title, and the scopes the backend already granted. The kit does not create users, store passwords, or choose a model.

`visiblePlaces(_:surface:)` hides a work-only person from the family chat and a home-only person from the work room. A person in both scopes can appear in both rooms. This is a visual guard. Your API must already omit records the signed-in person cannot see.

The agent title is a name your backend chose for that person's Matter. If it is nil, the seat shows only the person's name. Do not send a model id, a worker id, or a local endpoint to this view.

No real Mershon names are in the previews. The fixtures say Adult and Child.

## Photos, NAS, and media

Not built. `MatterKeptItem` is an id, a title, a scope, and `isPrivate`. There is no file URL, thumbnail, volume path, or network call.

When your app can read authorized storage later, keep the fetch in the host. Pass titles into `MatterKeptShelf`. Pass an image only in a later revision of the host, after the Mac has authorized that photo. A private item stays a title and the word Private until that authorization exists.

Home titles stay on the home shelf. Work titles stay in `MatterWorkRoom`. Do not put the work shelf on the family chat.

## Personal and business permissions

Home is the default room. Work is a separate room opened from Owner, behind the device check you already have. The kit does not decide who is allowed in. If the Mac has not separated work records, pass an empty list and the room says nothing is loaded.

## Appearance

Default to `MatterColorChoice.dark`. Offer Light and Follow System from Owner. The family chat uses the same palette either way.

## Leave alone

- `AI-HANDOFF/matter/phone-api.mjs`, `core-alpha.mjs`, and `execution.mjs`
- Approval decisions, intake, and execution controls
- Party Perfect production and kituwa.app
- The live supervisor
- PR #22, which stays a reference and stays unmerged

## Not verified here

This machine has no Xcode. The previews and tests were not compiled. The pictures in `Studies/` are browser paintings, not simulator captures, and not a session with the Mac mini.
