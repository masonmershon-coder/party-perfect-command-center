# The Wick — study notes

Matter is the primary assistant. Every launch opens Matter. A specialist such as Mike appears only when someone asks, and the Wick returns when they come back. A spoken name is not a sign-in.

This is an isolated visual and sound study. It is not part of Claude’s Matter app, Matter Core, or the mobile API. Every state in the prototype is labeled simulated. The picture never listens, reasons, runs a task, or enforces a safety hold.

`family.html` is the family-experience study: first launch, personalized homes, the visit to Mike, the return, a hidden specialist consult, and the owner safety console. `study.html` is the living Wick, including sound cues that stay silent until enabled. `Studies/` holds stills of those screens. Anti-Matter and the Safety Protocol are reserved pictures, not running systems. Automatic is the default intelligence mode; the router stays in Claude’s service.

Open `study.html` in a browser. `study.html?sheet=1` draws one still frame of each state.

## What to ship in SwiftUI

Use one SwiftUI `Canvas` driven by `TimelineView` only while the state is idle, listening, thinking, speaking, working, or waiting for approval. Dormant, offline, and safety hold draw a single frame and stop the timeline. That is the left-hand technique in the study: a filled organic shape, a soft radial glow, and one moving inner light.

The right-hand technique is the fallback: a shape whose only animation is scale and opacity. Use it when Reduce Motion is on, when Low Power Mode is on, and for the first integration if a device test shows the canvas costs too much.

Do not start with a Metal shader or a particle system. Metal is a later option only if a real device shows the canvas cannot hold 60 frames per second during speaking. Particles are the wrong look and the wrong battery cost.

## When it may move

| State | Motion | Runs only when |
| --- | --- | --- |
| Dormant | One dim frame | App is open and nothing is active |
| Idle | Slow breath, about 30 fps | App is foreground and no request is active |
| Listening | Shape opens with the live mic level | A real capture session is running |
| Thinking | Inner light circulates | An authenticated request is in flight |
| Speaking | Shape follows playback level | Audio is actually playing |
| Working | Slow outer arc | A real Matter task is running |
| Waiting for approval | Motion settles, a small ring appears | The ledger says a person must decide |
| Offline | One ash frame | The client knows it cannot reach the service |
| Safety hold | Motion stops, two quiet bars | An authenticated safety state says so |

The visual system displays those states. It does not decide them.

## Sound

Eight short cues, synthesized, no sample library: awaken, listening, accepted, ready, completed, approval, connection lost, safety hold. Nothing loops while idle. On iPhone, play them with an ambient audio session so the silent switch wins. Default the feature off until a person turns it on. There is no Matter speaking voice in this study. The intended voice is warm, low, and unhurried, the same voice for every seat, a little quieter for a child, with a pause before a decision. No catchphrase and no performed emotion.

## Integration, later

When this direction is approved, add a presence view beside Claude’s existing chat screen and feed it from the same authenticated state the app already trusts, plus a future safety-state field. Do not add a second client, a second classifier, or a visual that invents activity. Do not merge the open design branches as part of this study.

## What this environment did not prove

Swift was not available here. Nothing was compiled in Xcode, run in the simulator, or measured on an iPhone. The 60-frame target and the battery notes are design constraints, not device results.
