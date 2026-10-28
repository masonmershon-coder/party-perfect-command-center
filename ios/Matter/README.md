# Matter iPhone app

SwiftUI client kept on PR #22 so its Mission Control, device-auth, and offline behavior can be compared with Claude's app. It is not a second product. Claude's unpublished `agent/matter-ios-app` (`e041ad5`) is the app to install once that branch is available. This project was not compiled here.

## What this environment could not do

This change was made on a Linux cloud agent (`x86_64`), not on Mason’s Mac mini. `swift` and `xcodebuild` are not installed. There is no Apple Development certificate, provisioning profile, or connected iPhone. No development build was installed, and no Mac mini-to-iPhone request was observed. Commits `83e9c21` and `e041ad5` are not in this clone.

## Install on the Mac

1. Open `ios/Matter/Matter.xcodeproj` in Xcode 16 or newer only to inspect this client.
2. Select the Matter target and set your Development Team. The committed project has an empty team and `CODE_SIGNING_REQUIRED = NO`, so a device install stops at signing until that team is set.
3. Prefer Claude's `e041ad5` project for the physical iPhone test when that branch is published.
4. TestFlight is not configured in this repository.

## Connect to the Mac mini

The phone does not classify tasks and does not keep its own task database. Contract version 3 forwards create and approval calls only when `MATTER_INTAKE_URL` and `MATTER_APPROVAL_URL` are set. Otherwise those routes return 503 and write nothing. See `AI-HANDOFF/matter/PHONE_API_CONTRACT.md` and `AI-HANDOFF/matter/MOBILE_INTEGRATION_COMPARISON.md`.

Loopback HTTP is only for a terminal on the Mac. An iPhone requires a private address, an explicit LAN flag, and TLS certificate files. Public binds are refused. The first-device steps are `FIRST_DEVICE_CHECKLIST.md`.

In the app, open Settings, enter `https://<private-mac-address>:4786`, and save the token into Keychain. Approvals ask for Face ID or the device passcode before the request is sent. The Mac still has to accept the bearer token. Mission Control shows supervisor and worker state from `/v1/mission`. A saved snapshot is labeled not live.
