# KITUWA V1 — Codex independent verification package

**Do not treat Cursor’s build as certified.**

| Field | Value |
|--|--|
| Repository | `/Users/mikeai/grok-dashboard` |
| Branch | `agent/cursor/KITUWA-V1` |
| Parent SHA | `a5083c95f72d6bbd2d10eb69155acec7eb17cdf2` |
| Full SHA | *(git rev-parse HEAD after commit)* |
| Domain | `kituwa.app` (purchased; **not attached this cycle**) |
| Deployment URL | Preview only if listed in CURSOR_TO_CLAUDE — **not** Party Perfect production |
| Test login | `POST /api/kituwa/session` `{ pin }` using Vercel `KITUWA_OWNER_PIN` or `OWNER_PIN`. Never log the PIN. |
| Architecture | `AI-HANDOFF/EVIDENCE/KITUWA_V1_ARCHITECTURE.md` |

## Test commands

```
npx tsx scripts/test-kituwa.mjs
npm run test:matter-registry
node scripts/test-api-auth-matrix.mjs
npx tsc --noEmit
```

Cursor results (2026-08-17): all four PASS before package freeze.

## What to verify

AUTH · MOBILE · PWA · VOICE INPUT · TASK PERSISTENCE · REAL MATTER PLAN · REAL TASK STATE · PROVIDER-NEUTRAL ROUTING · NO FAKE ACTIVITY · SECURITY GATES · COST GATES · BROWSER-CLOSE RECOVERY · OFFLINE/FAILURE STATES · DEPLOYMENT ISOLATION

## Runtime honesty

- Pixel workers / Matter Live stations are **task-state driven**. V1 does not spawn Cursor/Codex. Stale Matter heartbeats → BLOCKED/OFFLINE, not fake BUILDING.
- Cost today / API budget: **UNKNOWN** unless a real ledger exists (none wired into Kituwa V1).
- Local Mac: **UNKNOWN** until `POST /api/kituwa/worker/heartbeat` with `KITUWA_WORKER_TOKEN`.
- In-process steps (understand / persist / plan) may COMPLETE. External execution must not.

## Security

- Cookie `kituwa_session` separate from CC/Time.
- Kituwa hosts must not serve `/api/por`, Time, Jobs.
- Protected actions stay `WAITING_APPROVAL`.
- Matter `route()` is reused; `orchestrate.mjs` is **not** the live web dispatcher.

## Known limitations

- `kituwa.app` DNS/Vercel attach not performed (isolation report required).
- No live meeting transcription pipeline.
- iPhone voice uses Web Speech API when present; otherwise type/attach.
- Durable store needs Redis or Blob on Preview or state is ephemeral.
- Party Perfect Time work remains on `agent/cursor/PP-TIME-001` (stashed separately).
