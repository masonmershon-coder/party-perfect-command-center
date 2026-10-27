# First iPhone checklist

No item below has been completed on a physical iPhone. This agent is Linux and has no Xcode, signing identity, or device.

## Before opening Xcode

- [ ] Confirm the Foundry Mac mini is the machine that will run the gateway. This repository clone does not contain commit `560585c`.
- [ ] Choose the existing Matter data directory. Do not create a second task database.
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
node AI-HANDOFF/matter/phone-api.mjs
```

- [ ] Do not set the host to `0.0.0.0` and do not forward the port to the public internet.
- [ ] Install and trust the private certificate on the iPhone. The app does not disable App Transport Security.

## Build and install

- [ ] Open `ios/Matter/Matter.xcodeproj` in Xcode 16 or newer on a Mac.
- [ ] Select the Matter target and set a Development Team. The committed project has an empty team.
- [ ] Run `MatterTests` (Product → Test). The contract decode test has not been executed here.
- [ ] Connect Mason's iPhone and run the Matter scheme. Record the installed build number and the device name.

## Acceptance pass

- [ ] Mission Control shows the live supervisor pid from `/v1/mission`, or shows not healthy if the process is down. It must not show a live process from a saved snapshot.
- [ ] Send a harmless note from Chat. The app shows the status returned by the ledger.
- [ ] On the Mac, that task exists in `LEASES.json` with `requirements.origin` `matter-phone` and no lease.
- [ ] Restart the supervisor. The same task is still in `LEASES.json` and still shown in the app.
- [ ] Submit a protected request, such as emailing a customer. Status is `WAITING_APPROVAL`. The ledger refuses a lease. Face ID or the device passcode is required before Approve or Reject, and the server still checks the bearer token.
- [ ] Reject it. The ledger state is `BLOCKED`, and a later approve attempt returns 409.
- [ ] Turn off Wi-Fi. Mission Control says the connection is not live. It must not present cached rows as a live supervisor.
- [ ] Set the token expiry in the past and confirm the app shows session expired rather than a successful refresh.

## Still blocked from this agent

- No `swift` or `xcodebuild` binary.
- No Apple Development certificate or provisioning profile.
- No connected iPhone.
- No route to the Foundry Mac mini supervisor.
