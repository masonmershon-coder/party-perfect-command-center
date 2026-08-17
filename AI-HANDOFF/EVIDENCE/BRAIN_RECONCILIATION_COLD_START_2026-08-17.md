# Cold-start test — Brain Reconciliation P0 (2026-08-17)

**Tester role:** New verifier with no chat history.  
**Sources allowed:** durable brain/evidence only (paths below).  
**Verdict:** PASS with residual drift (unpushed branches; Drive absent).

## Questions

| # | Question | Answer from durable sources only | Source |
|---|----------|----------------------------------|--------|
| 1 | What is current? | Aug 13–17 work lives on **local unpushed branches**; Time candidate tip `ad5e8b6` on `agent/cursor/PP-TIME-001`; Matter V1 `51c362c`; Matter P0 `dbcd378`; Mike live-answer `dad53e0`. | `PARTY_PERFECT_BRAIN_MANIFEST.json`, `BRAIN_INVENTORY_2026-08-17.json` |
| 2 | What is deployed? | Production CC **v1.9.7** commit `e8dac0e` (not `origin/main`). | `RELEASE_STATE.md` |
| 3 | What is preview? | Party Perfect Time preview URL documented; **not** production employee cutover. | `EVIDENCE/PP-TIME-001_PREVIEW.md`, Time go-live readiness |
| 4 | What is held? | Migration `0009`, Time production deploy, POR writes, paid autonomous compute, watchdog arming, Google Drive sync. | Manifest `hard_holds`, Time evidence |
| 5 | What SHA per subsystem? | See manifest `subsystems.*.full_sha` / `deployed_sha`. | `PARTY_PERFECT_BRAIN_MANIFEST.json` |
| 6 | What tests passed? | Matter V1 17/17 from bundle clone; Matter P0 execution/watchdog tests documented; Time `npm run test:time` claimed in evidence (re-run from bundle). | Matter V1 manifest; `MATTER_P0_STATUS.md`; Time verification bundle |
| 7 | What remains unverified? | Time roles/correction overlay runtime; Square through 2026-08-17; Shadow Mode HEALTHY sync; preview Vercel access for Codex. | Time evidence + manifest blockers |
| 8 | What needs Mason approval? | Apply `0009`, Time deploy, Square Labor scopes/token, Drive destination (if desired), push shared branches, paid compute budget, reboot/launchd recovery. | Manifest + DECISIONS + hard holds |
| 9 | Where is the exact candidate? | Time: `AI-HANDOFF/EVIDENCE/pp-time-001/pp-time-candidate-eeb5a8ff6662.bundle` → branch `agent/cursor/PP-TIME-001` @ `ad5e8b6`. Matter V1: `EVIDENCE/matter-v1/matter-v1-candidate-51c362cb1187.bundle`. | Bundle paths |
| 10 | How to reproduce verification? | See clone steps below + per-package test commands. | This file + verification manifests |

## Reproduce Time candidate (no GitHub required)

```bash
rm -rf /tmp/pp-time-verify && mkdir /tmp/pp-time-verify && cd /tmp/pp-time-verify
git init
git pull /ABS/PATH/TO/repo/AI-HANDOFF/EVIDENCE/pp-time-001/pp-time-candidate-eeb5a8ff6662.bundle agent/cursor/PP-TIME-001
git checkout -B agent/cursor/PP-TIME-001
git rev-parse HEAD   # expect ad5e8b680424aca55ba8828a0175eb33b6c25388
npm run test:time    # from that tree after deps install
```

**Note:** plain `git clone bundle` may leave an empty `main`; always pull the named branch.

## Reproduce Matter V1

Follow `EVIDENCE/MATTER_PROVIDER_NEUTRAL_V1_VERIFICATION_MANIFEST.md` and `EVIDENCE/matter-v1/11_bundle_independent_verification.txt`.

## Cold-start residual gaps (honest)

- Most Aug 13–17 branches are **local-only** (not on `origin`) — bundles mitigate Codex access.
- Google Drive sync is **not** implemented; SSD brain is POR/export oriented.
- Manifest `command_center.deployed_sha` must not be confused with `origin/main` (`a10a09a`).
