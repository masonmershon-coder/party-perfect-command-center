# KITUWA V1 — architecture note

**Date:** 2026-08-17  
**Product:** Kituwa (interface) · Matter (orchestrator)  
**Domain:** `kituwa.app` (purchased; **not attached in this cycle**)  
**Not:** Party Perfect Command Center, Time, Jobs, Mike, Madison UI

## Inventory (honesty)

| Piece | State | Use in V1 |
|--|--|--|
| `MATTER_POLICY.json` 1.3.0 | REAL | Read; gates unchanged; bridge not replacement |
| `matter-registry.mjs` `route()` | REAL | Worker selection; not replaced |
| `orchestrate.mjs` role dispatch | LEGACY | **Not** switched to as live executor |
| `execution.mjs` / watchdog | PARTIAL / local Mac | Not silently enabled from the web app |
| `/api/matter/orchestration` | REAL (CC owner) | Health snapshot reused via `loadMatterOrchestrationSnapshot` |
| `ai_core` / `brain_records` | LIVE on PP DB | Not a second brain; Kituwa does not invent a competing store |
| `brain-sync.mjs` | SYNC CODE READY; auto NOT running | Health shows last sync timestamp from `BRAIN_SYNC_STATE.json` or UNKNOWN |
| Durable JSON (Redis/Blob/local) | REAL | Kituwa control-plane SoR (`kituwa/state.json`) |
| Kituwa UI / domain routing | MISSING → this V1 | `/kituwa` + host rewrite |

## Integration boundary

```
PHONE → kituwa.app → /kituwa (this Next app, isolated host)
      → /api/kituwa/* (Mason session)
      → durable JSON control plane (requests, plan, tasks)
      → Matter route() for eligible workers (capability, never provider identity)
      → workers connect outbound later (heartbeat). No inbound Mac ports.
```

Party Perfect production hosts (`partyperfect.app`, jobs, time-preview) are unchanged except additive routes that they do not serve as `/`.

**Do not** treat `route()` assignment as proof a worker is running. Pixel stations follow **task state**, not animations.

## Auth / gates

- Cookie `kituwa_session` (HttpOnly). Separate from CC and Time.
- PIN: `KITUWA_OWNER_PIN` or fallback `OWNER_PIN`.
- Capabilities ≠ permissions. Talk creates tasks. Protected actions (`money_spend`, deploy, external comms, POR, credentials) stay `WAITING_APPROVAL`.
- No public unauthenticated Matter talk.

## What V1 actually does

Deterministic intake: persist utterance → infer project → real plan → durable tasks → `route()` each intelligence task → report blockers.

In-process steps (understand / persist / plan) can COMPLETE because this server did them.

External build/research does **not** COMPLETE unless a worker is eligible and actually running. Stale registry heartbeats → OFFLINE / BLOCKED. No fake activity.

## Deployment (this cycle)

Prepare code + Preview. **Do not** attach `kituwa.app` to the Party Perfect production project until Mason confirms the isolated Vercel project/alias plan.
