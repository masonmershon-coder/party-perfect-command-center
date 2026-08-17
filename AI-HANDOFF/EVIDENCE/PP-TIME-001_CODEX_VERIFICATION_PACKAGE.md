# PP-TIME-001 — Codex verification package (brain reconciliation)

**Published:** 2026-08-17  
**Deploy:** NOT AUTHORIZED  
**Migration 0009:** NOT APPLIED  
**Square:** DO NOT MODIFY for this package  

## Exact candidate

| Field | Value |
|------|--------|
| Repository | `/Users/mikeai/grok-dashboard` |
| Branch | `agent/cursor/PP-TIME-001` |
| Full SHA | `ad5e8b680424aca55ba8828a0175eb33b6c25388` |
| Base SHA | `262d40924823db9440dc95403b3d468333b60e17` |
| Bundle | `AI-HANDOFF/EVIDENCE/pp-time-001/pp-time-candidate-eeb5a8ff6662.bundle` |
| Pushed to origin? | **NO** |
| Deployed? | **NO** |

Bundle `list-heads` tip is `ad5e8b6` (filename retains earlier `eeb5a8f` label). Includes Time lib/API, UI/PWA, tests, Matter Control surface preserved on the same branch.

## Obtain without GitHub

```bash
rm -rf /tmp/pp-time-verify && mkdir /tmp/pp-time-verify && cd /tmp/pp-time-verify
git init
git pull "$REPO/AI-HANDOFF/EVIDENCE/pp-time-001/pp-time-candidate-eeb5a8ff6662.bundle" agent/cursor/PP-TIME-001
git checkout -B agent/cursor/PP-TIME-001
test "$(git rev-parse HEAD)" = "ad5e8b680424aca55ba8828a0175eb33b6c25388"
```

## Test command

```bash
npm ci   # or npm install
npm run test:time
```

## Known blockers (do not redesign in brain task)

- Preview Vercel access for verifier
- Square CSV evidence only through **2026-08-14**
- Shadow Mode sync unproven
- Roles / correction overlay runtime-unverified

## Config without secrets

Env **names** only (see `.env.example`): `TIME_SESSION_SECRET`, `CRON_SECRET`, Square token with `TIMECARDS_READ` for future Shadow Mode — **not** provisioned in this package.
