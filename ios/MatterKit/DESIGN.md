# The Wick

Matter’s presence is a banked flame and the small pool of light it casts. It is not an orb, not a face, and not a status icon. The room is warm charcoal or warm paper. The flame is the only strong color.

This is the visual direction for the native iPhone app. Claude’s `e041ad5` was not in this clone, so the SwiftUI lives in `ios/MatterKit` and does not replace that app or the phone gateway.

## What someone sees first

1. The Wick, and one quiet word for its state.
2. The conversation. The person’s words sit in a soft capsule. Matter’s words sit on the background, with a thin flame-colored rule.
3. A place to type, and a listen button.
4. House routines, only when the backend has recorded some.
5. Owner, as a word in the corner. Mission Control, agents, approvals, tasks, and health stay behind it.

There is no tab bar on the family screen.

## States

The Wick changes only when the host reports a real event. `matterPresence(_:)` applies that rule. A screen refresh is not thinking. Arriving text is not speaking. A queued task is not work.

| State | Word on screen | Required event |
|---|---|---|
| Idle | Here | Connected, and nothing below is happening |
| Listening | Listening | The microphone is actually open |
| Thinking | Thinking | A message the person just sent is still waiting on intake |
| Speaking | Speaking | This iPhone is playing a Matter reply |
| Working | Working | Ledger state is `RUNNING` or `LEASED` |
| Waiting for approval | Waiting for you | Ledger state is `WAITING_APPROVAL` |
| Offline | Offline | No connection, a rejected token, or an expired session |

`QUEUED`, `SUCCEEDED`, `BLOCKED`, and failed states stay on Here. The conversation can show what happened. The flame does not perform work that the ledger has not started.

A progress ring appears only when the host passes a fraction. Waiting and offline hold still. Every other state has one slow breath, about four seconds, and only while the app is active. Reduce Motion removes the breath. Increase Contrast draws an ink edge on the flame so the state is not carried by color alone. The word under the flame is always there.

## Color and type

Default is dark. Owner mode can choose Dark, Light, or Follow System.

Dark is near-black with a warm bias (`#100E0C`), ivory text (`#F3EDE4`), and an amber flame (`#E7B089`). Light is warm paper (`#F6F1EA`) with a clay flame (`#C4653A`). Approval is antique gold, quieter than the working flame. Offline is ash, and the pool of light almost disappears.

The word Matter and the state word use the system serif. Conversation and controls use the system text face so a child can read them, and they follow Dynamic Type. Utility controls use standard symbols. The flame is the only custom mark.

Surfaces are flat color, a hairline, and the light cast by the flame. No glass material, no neon, no second accent competing with the flame.

## Family and owner

Family mode is the home above. It does not show pids, worker ids, or ledger words.

Owner mode repeats the same room color and lists mission, local intelligence, approvals, tasks, agents, and activity from strings the host already loaded. If those details were not loaded, it says so. Approve and Reject call back to the host. The screen says that Face ID only confirms the device and the Mac still has to authorize the decision.

## How to integrate

Keep Claude’s API client, device authentication, and screens until this kit replaces the family root.

- Map connection, microphone, in-flight intake, speech playback, and the current ledger state through `matterPresence(_:)`.
- Pass `requestInFlight` only for the send the person just made. Do not pass the loading flag from a background refresh.
- Pass `speechPlaying` only while audio is actually playing.
- Pass routines and turns from the backend. An empty list stays an empty list.
- Open Owner only after the existing Face ID check. Keep the bearer token on the request.
- Default the appearance choice to `MatterColorChoice.dark`.

The existing tabbed client in `ios/Matter` is unchanged. This package does not talk to the network.

## Not done here

`swift` and `xcodebuild` are not on this machine. The previews and `MatterKitTests` have not been compiled. Nothing here was run in the iOS simulator or on the Foundry Mac mini. The paintings in `Studies/` are browser studies of this layout, labeled as studies, so the direction can be seen before Xcode is available.
