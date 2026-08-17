# Cursor → Codex · 2026-08-17 · BRAIN-RECONCILE-001

**Status:** READY_FOR_CODEX_BRAIN_REVERIFY

## What to verify

Party Perfect brain reconciliation P0: inventory, preserve, manifest, handoff, verifier bundles, brain-sync code (not automatic), cold-start.

**Do not** verify Time go-live or Square cutover — those remain held.

## Exact candidates

| Subsystem | SHA | Bundle / path |
|-----------|-----|----------------|
| Time | `ad5e8b680424aca55ba8828a0175eb33b6c25388` | `EVIDENCE/pp-time-001/pp-time-candidate-eeb5a8ff6662.bundle` |
| Matter V1 | `51c362cb1187d3459d103bd2768767ef3934612e` | `EVIDENCE/matter-v1/matter-v1-candidate-51c362cb1187.bundle` |
| Matter P0 autonomy | `dbcd378387a1132002994db7ce1040cfe704d98f` | branch `claude/matter-p0-execution-substrate` (local) |
| Live CC | `e8dac0e…` | `RELEASE_STATE.md` |

## Start here

1. `AI-HANDOFF/PARTY_PERFECT_BRAIN_MANIFEST.json`
2. `AI-HANDOFF/BRAIN_INVENTORY_2026-08-17.json`
3. `AI-HANDOFF/EVIDENCE/BRAIN_RECONCILIATION_COLD_START_2026-08-17.md`
4. Pull Time branch from bundle (named branch — not empty `main`)

## Non-claims

- Google Drive sync is **not** implemented
- Automatic brain sync is **not** running (launchd degraded)
- Time is **not** live for employees
