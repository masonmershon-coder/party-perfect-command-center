# First iPhone checklist

No item below has been completed on a physical iPhone. This agent is Linux and has no Xcode, signing identity, or device. Claude's simulator report for `e041ad5` was not repeated here because that commit is not in this clone.

The physical test should use one app and one API. Until `agent/matter-ios-app` and `agent/matter-mobile-api` are available to review, do not treat this project as a second install target.

## Before opening Xcode

- [ ] Confirm the Foundry Mac mini is the machine that will run Matter. This repository clone does not contain commits `560585c`, `83e9c21`, or `e041ad5`.
- [ ] Choose the existing Matter data directory. Do not create a second task database.
- [ ] Point task intake and approval decisions at Claude's services. This gateway returns 503 for both when those URLs are unset, and it does not classify text.
- [ ] Mint a token on the Mac and keep it out of git: `openssl rand -hex 24`
- [ ] Create a private certificate and key on the Mac. Do not commit them.
- [ ] Bind the gateway to a private address only, with TLS:

```sh
export MATTER_DATA_ROOT="/path/to/existing/matter-data"
export MATTER_PHONE_TOKEN="paste-the-token"
export MATTER_PHONE_TOKEN_NOT_AFTER="2026-11-27T00:00:00Z"
export MATTER_PHONE_HOST="192.168.x.x"
export MATTER_PHONE_ALLOW_LAN=1
export MATTER_PHONE_TLS_CERT="/path/to/cert.pem"
export MATTER_PHONE_TLS_KEY="/path/to/key.pem"
# Set these only after Claude confirms the paths and body shape:
# export MATTER_INTAKE_URL="https://127.0.0.1:9/replace-with-claude-intake"
# export MATTER_APPROVAL_URL="https://127.0.0.1:9/replace-with-claude-approvals"
node AI-HANDOFF/matter/phone-api.mjs
```

- [ ] Do not set the host to `0.0.0.0` and do not forward the port to the public internet.
- [ ] Install and trust the private certificate on the iPhone. The app does not disable App Transport Security.

## Build and install

- [ ] Review `e041ad5` before installing a second Matter app.
- [ ] Open `ios/Matter/Matter.xcodeproj` in Xcode 16 or newer on a Mac if this client is still the one under test.
- [ ] Select the Matter target and set a Development Team. The committed project has an empty team.
- [ ] Run `MatterTests` (Product → Test). The contract decode test has not been executed here.
- [ ] Connect Mason's iPhone and run the Matter scheme. Record the installed build number and the device name.

## Acceptance pass

- [ ] Mission Control shows the live supervisor pid from `/v1/mission`, or shows not healthy if the process is down. It must not show a live process from a saved snapshot.
- [ ] Send a note from Chat with intake unset. The banner shows `intake_required`. `LEASES.json` does not gain a task from that request.
- [ ] After Claude's intake URL is confirmed and set, send a note. The app may say the message was accepted. It must not invent a task status that the ledger did not return. Confirm the record in Claude's intake store.
- [ ] Restart the supervisor only under the existing launchd rules. Do not restart it from this checklist to prove the phone gateway.
- [ ] Open Approvals. Face ID or the device passcode is required before Approve or Reject, and the server still checks the bearer token.
- [ ] With the approval URL unset, the banner shows `approval_journal_required` and this gateway does not change ledger state.
- [ ] Turn off Wi-Fi. Mission Control says the connection is not live. It must not present cached rows as a live supervisor.
- [ ] Set the token expiry in the past and confirm the app shows session expired rather than a successful refresh.

## Still blocked from this agent

- No `swift` or `xcodebuild` binary.
- No Apple Development certificate or provisioning profile.
- No connected iPhone.
- No route to the Foundry Mac mini supervisor.
- Claude's mobile commits are unpublished, so this checklist cannot certify that app.
