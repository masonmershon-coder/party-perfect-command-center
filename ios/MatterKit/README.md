# MatterKit

Isolated SwiftUI for Matter’s iPhone presence. It draws the Wick, the family home, and owner details. It does not classify tasks, call the network, or replace Claude’s app.

Open `Package.swift` in Xcode 16 or newer and use the previews in `MatterPreviews.swift`. The presence tests are `Tests/MatterKitTests`. The design is `DESIGN.md`.

On a Mac, the host app should map live events with `matterPresence(_:)` and present `MatterFamilyHome`. Owner mode stays behind the app’s existing Face ID check and the Mac’s bearer token.

This package was written where Xcode is not installed. It has not been compiled or run in the simulator.
