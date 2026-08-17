# macOS background-execution diagnostic — why launchd will not auto-spawn

**Date:** 2026-08-17 · **Scope:** diagnosis only. Nothing armed, no reboot, no logout, no paid autonomy.

## ANSWER BLOCK

```
CURRENT METHOD          = Legacy manually-installed LaunchAgent plists in ~/Library/LaunchAgents,
                          loaded with `launchctl bootstrap gui/501`. No app bundle, no signed
                          helper, no SMAppService registration. BTM classifies every one of them
                          Type: "legacy agent (0x10008)", Flags: [ legacy ].

BACKGROUND AUTH STATE   = ENABLED / ALLOWED / NOTIFIED  (0xb) for ALL Party Perfect agents:
                          com.partyperfect.matter, .github-bridge, .meeting-watcher,
                          .prevent-sleep, .codex.daily, .codex.weekly, app.matter.intake,
                          ai.openclaw.gateway.
                          NOT "requires-approval". NOT "not-registered". NOT "not-found".
                          Not present in `launchctl print-disabled gui/501`.
                          => BACKGROUND AUTHORIZATION IS **NOT** THE BLOCKER.

LEGACY PLIST ONLY       = YES

SMAPPSERVICE RECOMMENDED= NO (not now)

ROOT CAUSE CONFIDENCE   = BTM/authorization ruled OUT: HIGH (direct sfltool evidence)
                          launchd scheduling subsystem degraded: MEDIUM-HIGH (strong
                          circumstantial, not yet proven — proof requires the escalation below)

NEXT SAFE TEST          = LOGOUT / LOGIN (rebuilds the gui/501 domain). Cheaper and less
                          disruptive than a reboot. PREPARED BELOW, NOT EXECUTED.
```

## Correction to my previous recommendation

Last cycle I told Mason to check **System Settings → General → Login Items & Extensions → Allow in
the Background**. **That was wrong.** The direct BTM evidence shows every agent is already
`[enabled, allowed, notified]`. There is no toggle for Mason to flip — the items are authorized.
No owner action is available on that path.

## Evidence

### 1. Bootstrap and registration succeed
```
launchctl bootstrap gui/501 ~/Library/LaunchAgents/pp.diag.plist   → exit 0, no stderr
launchctl print gui/501/pp.diag →
   type = LaunchAgent · domain = gui/501 [100024] · state = not running
   runs = 0 · last exit code = (never exited)
```
The job is registered, correctly pathed, in the right domain — and is simply never spawned.
`(never exited)` confirms it was never launched, as opposed to launched-and-crashed.

### 2. The domain itself is healthy and is the real GUI session
```
gui/501 = { type = login · session = Aqua · creator = loginwindow[402]
            service count = 450 · active service count = 145 · asid = 100024 }
```
The job's asid (100024) matches the domain's. Not an SSH/detached-session artefact.

### 3. Background Task Management explicitly allows them
`sfltool dumpbtm` (no sudo needed), UID 501:

| Identifier | Disposition |
|---|---|
| `8.com.partyperfect.matter` | `[enabled, allowed, notified] (0xb)` |
| `8.com.partyperfect.github-bridge` | `[enabled, allowed, notified] (0xb)` |
| `8.com.partyperfect.meeting-watcher` | `[enabled, allowed, notified] (0xb)` |
| `8.com.partyperfect.prevent-sleep` | `[enabled, allowed, notified] (0xb)` |
| `8.com.partyperfect.codex.daily` / `.weekly` | `[enabled, allowed, notified] (0xb)` |
| `8.app.matter.intake` | `[enabled, allowed, notified] (0xb)` |
| `8.ai.openclaw.gateway` | `[enabled, allowed, notified] (0xb)` |

`backgroundtaskmanagementd` is running (pid 40331). `ServiceManagement migrated: true`.
Even the throwaway `pp.diag` produced BTM records — registration works.

### 4. ALL scheduling mechanisms are dead, not just one
Proven on brand-new minimal control plists containing no Party Perfect code:

| Mechanism | Result |
|---|---|
| `RunAtLoad` | never fired |
| `StartInterval` (15s / 20s / 30s) | never fired |
| `KeepAlive` + `kill -9` | never respawned |
| `launchctl kickstart` (on-demand) | **works every time** |

### 5. Run counts are frozen far below expectation — 82 days of uptime
```
uptime: up 82 days (booted Wed May 27 2026)
com.partyperfect.codex.daily   runs = 5      (a daily job over 82 days should be ~82)
com.partyperfect.github-bridge runs = 1      (300s interval)
com.partyperfect.meeting-watcher runs = 3    (120s interval)
app.matter.intake              runs = 1
com.partyperfect.matter        runs = 57     (2 of those are my manual kickstarts)
```
Calendar-driven, interval-driven, and load-driven spawning all stopped after a handful of runs.
The on-demand XPC path still works. That pattern — registered, authorized, on-demand OK,
timer/auto-spawn dead across every mechanism, on a host with 82 days uptime — is what points at a
degraded launchd scheduling state rather than any configuration or permission fault.

### 6. Corroborating (weak) signal — do not over-read
`log show --last 2m` returns **0 lines total**, including for `process == "launchd"`. Because the
whole query returns nothing, its silence about denials is **not evidence of no denials** — it is
evidence the log pipeline is not returning data in this context. Noted only because a
non-functional `logd` is consistent with broader long-uptime degradation; it proves nothing on its own.

## Why NOT SMAppService (yet)

`SMAppService` (macOS 13+) solves an **authorization/registration** problem — agents that need user
approval and durable re-registration. We have measured that authorization is already granted, so
SMAppService would fix a problem we do not have. It also requires an app bundle, code signing and
notarization, and would still be scheduled by the same launchd that is currently not honouring
timers. Revisit **only if** scheduling returns after the escalation and we then want robust,
self-healing registration for a shipped helper.

## PREPARED — NOT EXECUTED — escalation

Run in this order, stopping at the first that restores scheduling. Re-verify after each with:
```bash
bash /Users/mikeai/grok-dashboard/AI-HANDOFF/matter/launchd-control-test.sh
```

**Step 1 — logout / login** (rebuilds the `gui/501` domain; least disruptive).
Kills: this session, iMessage bridge, intake worker, OpenClaw gateway. Nothing on the SSD/POR is affected.

**Step 2 — full reboot** (only if step 1 does not restore scheduling).

**Step 3 — if scheduling still fails after a clean reboot**, the fault is not transient state, and
the correct response is architectural: run supervision as a persistent process started at login
(a login item or a user-launched daemon with its own timer, which is how the iMessage bridge and
OpenClaw gateway have survived for days), and *then* consider SMAppService for durable registration.

**Do not arm the watchdog and do not start the soak until the control test prints PASS.**
