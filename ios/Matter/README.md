# Matter iPhone app

Native SwiftUI client for the Matter phone gateway. It shows Chat, Tasks, Approvals, Agents, and Settings. Status comes from the gateway responses. A missing supervisor snapshot is shown as not healthy.

## What this environment could not do

This change was made on a Linux cloud agent (`x86_64`), not on Mason’s Mac mini. `swift` and `xcodebuild` are not installed. There is no Apple Development certificate, provisioning profile, or connected iPhone. No development build was installed, and no Mac mini-to-iPhone request was observed.

## Install on the Mac

1. Open `ios/Matter/Matter.xcodeproj` in Xcode 16 or newer.
2. Select the Matter target and set your Development Team. The committed project has an empty team and `CODE_SIGNING_REQUIRED = NO`, so a device install stops at signing until that team is set.
3. Connect the iPhone and run the Matter scheme.
4. TestFlight is not configured in this repository.

## Connect to the Mac mini

The phone does not classify tasks and does not keep its own task database. The gateway writes `LEASES.json` through the Core execution ledger. See `AI-HANDOFF/matter/PHONE_API_CONTRACT.md` version 2.

Loopback HTTP is only for a terminal on the Mac. An iPhone requires a private address, an explicit LAN flag, and TLS certificate files. Public binds are refused. The first-device steps are `FIRST_DEVICE_CHECKLIST.md`.

In the app, open Settings, enter `https://<private-mac-address>:4786`, and save the token into Keychain. Approvals ask for Face ID or the device passcode before the request is sent. The Mac still has to accept the bearer token. Mission Control shows supervisor and worker state from `/v1/mission`. A saved snapshot is labeled not live.
