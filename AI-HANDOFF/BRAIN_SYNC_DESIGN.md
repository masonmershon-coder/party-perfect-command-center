# Brain Sync Design — shared knowledge layer

**Status:** SYNC CODE READY · AUTOMATIC SYNC NOT RUNNING  
**Date:** 2026-08-17  
**Code:** `AI-HANDOFF/matter/brain-sync.mjs`

## Drive connection

**DRIVE_SYNC_IMPLEMENTED = NO**

Evidence:

- `~/Library/CloudStorage` has no Google Drive mount
- No `Google Drive.app` / rclone / gdrive destination configured in repo
- Existing durable brain path is the SSD: `/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN` (POR exports + numbered folders) — **not** Google Drive

## Authority model (do not invert)

| Layer | Authority for |
|------|----------------|
| Git | Source code |
| Supabase / AI Core + handoff JSONL | Structured runtime state |
| POR on ENTERPRISE | Business truth of record |
| Shared knowledge sync (Drive or configured dest) | Manifest, decisions, evidence summaries, handoffs, architecture docs |

Drive/shared sync is **never** a substitute Git remote.

## What syncs

Allowlisted under `AI-HANDOFF/`:

- `PARTY_PERFECT_BRAIN_MANIFEST.json`
- Decisions / system truth / Matter audits / status docs
- `EVIDENCE/*.md` summaries

## What never syncs

Screened by filename **and** content:

- `.env`, credentials, tokens, keys, PEM
- git `.bundle` binaries (obtain separately via verifier package)
- customer PII dumps
- plaintext PINs

## How to run

```bash
# Default: dry-run / NOT_CONFIGURED if BRAIN_SYNC_DEST unset
node AI-HANDOFF/matter/brain-sync.mjs

# Optional interim (SSD knowledge folder — not Drive):
BRAIN_SYNC_DEST="/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/00-MANIFESTS/agent-brain" \
  node AI-HANDOFF/matter/brain-sync.mjs --run

node AI-HANDOFF/matter/brain-sync.mjs --status
```

Tracks: `LAST_SYNC_ATTEMPT`, `LAST_SUCCESSFUL_SYNC`, `FILES_CHANGED`, `MANIFEST_VERSION`, `ERRORS`, `SOURCE_SHA` in `BRAIN_SYNC_STATE.json` + `BRAIN_SYNC_LOG.jsonl`.

## Autonomy claim boundary

| Claim | Truth |
|------|--------|
| SYNC CODE READY | YES |
| AUTOMATIC SYNC RUNNING | NO |

This Mac’s launchd auto-scheduling is degraded (`AI-HANDOFF/matter/MACOS_BACKGROUND_DIAGNOSTIC.md`). Installing another timer would falsely claim autonomy. Schedule only after logout/login recovery is certified.
