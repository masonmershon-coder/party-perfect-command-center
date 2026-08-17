# Logout / login recovery test — pre-flight + runbook

**Pre-logout snapshot taken:** 2026-08-17T16:05Z (local 11:05) · baseline JSON:
`AI-HANDOFF/matter/PRE_LOGOUT_SNAPSHOT.json`

# SAFE_TO_LOGOUT = YES

## Pre-flight results

| # | Check | Result |
|---|---|---|
| 1 | Matter state flushed/saved | **DONE** — registry re-probed and written; all Matter state is file-backed (no in-memory-only state) |
| 2 | Git work committed | **All my work is committed to branches** (see below). Other uncommitted work exists but is on disk and unaffected by logout |
| 3 | DB migration / write running | **NONE** — no `psql`/`pg_dump`/supabase/migration process |
| 4 | POR operation running | **NONE** — no `sqlcmd`/PowerShell/POR-sync process; SSD mounted but **no open write handles** |
| 5 | Production deployment running | **NONE** — no vercel/next-build/deploy process |
| 8 | **SAFE_TO_LOGOUT** | **YES** |

### My work — committed, survives anything

```
claude/matter-provider-neutral-v1        @ 51c362c
claude/matter-p0-execution-substrate     @ dbcd378
claude/mike-live-answer-001              @ dad53e0
```

## 6/7. Recorded state (PIDs are pre-logout; all of these WILL be killed by logout)

| Component | PID | State | Recovery after login |
|---|---|---|---|
| iMessage bridge | **40933** | running; cursor `lastRowId: 22` (file-backed) | resumes without reprocessing; must be **restarted manually** |
| Intake worker | **42490** | healthy (`/health` 200); 6 queued items, 13 artifacts on disk | file-backed; orphaned from launchd, so **restart manually** |
| OpenClaw gateway | **13439** | running | launchd `runs = 4` |
| Matter gateway (dev) | 28403 | running | dev process |
| next dev server | 77334 | running | dev process |
| **Queues / leases / DLQ** | — | leases **0**, DLQ **0**, lease_log **0** (substrate is new and idle) | all file-backed |
| Worker registry | — | 5 workers, 8 policy acks | file-backed |
| MASTER_STATE tasks | — | **48** | file-backed |
| Watchdog | — | **UNARMED** (`ARMED` absent) | stays unarmed |

### launchd run-count BASELINE — compare these numbers after login

```
com.partyperfect.matter            runs = 57     ← 2 of these were my manual kickstarts
com.partyperfect.github-bridge     runs = 1
com.partyperfect.meeting-watcher   runs = 3
app.matter.intake                  runs = 1
com.partyperfect.codex.daily       runs = 5
com.partyperfect.codex.weekly      runs = 1
ai.openclaw.gateway                runs = 4
com.partyperfect.prevent-sleep     runs = 1
```

**If these numbers climb on their own after login, launchd scheduling has recovered.**

## Before you click Log Out

1. **Save any unsaved editor buffers in Cursor.** Logout does not delete files, but an unsaved
   buffer is lost. There is other in-progress work in the tree (37 modified tracked files on
   `agent/cursor/PP-TIME-001`, plus 2 stashes) — all of it is on disk and safe, but only if saved.
2. Expect these to stop: this Claude session, the iMessage bridge, the intake worker, the OpenClaw
   gateway, the dev server. **Nothing on the SSD, in POR, or in production is touched.**
3. Log out normally (Apple menu → Log Out), then log back in.

## After login — run this first, before anything else

```bash
bash "/Users/mikeai/grok-dashboard/AI-HANDOFF/matter/launchd-control-test.sh"
```

It prints **PASS / PARTIAL / FAIL** and cleans up after itself. Paste me the output.

Then I will (without assuming recovery) check: RunAtLoad · StartInterval · KeepAlive ·
launchd run counts vs the baseline above · Matter scheduler · intake · bridge · OpenClaw ·
worker heartbeats — and return exactly one verdict:

- **LAUNCHD_RECOVERED** → then, in strict order and *not* all at once: (1) control test PASS,
  (2) prove KeepAlive by killing only a throwaway test process, (3) verify automatic respawn,
  (4) install watchdog supervision, (5) start watchdog **UNARMED**, (6) verify its heartbeat/status,
  (7) **then ask you for authorization to ARM it.**
- **LAUNCHD_STILL_DEGRADED** → **STOP.** No further launchd fiddling. I prepare the reboot test as
  the next escalation and wait for your approval.

Watchdog stays unarmed and paid autonomous compute stays OFF in both branches.
