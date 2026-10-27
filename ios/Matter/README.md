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

On the Mac mini, from this repository, with a data directory that already exists:

```sh
export MATTER_DATA_ROOT="/path/to/existing/matter-data"
export MATTER_PHONE_TOKEN="$(openssl rand -hex 24)"
export MATTER_PHONE_HOST="127.0.0.1"
node AI-HANDOFF/matter/phone-api.mjs
```

`127.0.0.1` is reachable from the Mac, not from the iPhone. For a phone on the same network, set `MATTER_PHONE_HOST` to the Mac’s LAN address and `MATTER_PHONE_ALLOW_LAN=1`. Do not publish that port on the public internet. The gateway has a bearer token and no TLS terminator.

In the app, open Settings, enter `http://<mac-lan-ip>:4786`, and save the same token into Keychain. Pull to refresh on any tab. The token is not written into the repository.

The gateway contract is `AI-HANDOFF/matter/PHONE_API_CONTRACT.md`.
