# TALK-TO-MIKE-INTAKE-001

**Status:** implemented in-repo · `READY_FOR_VERIFICATION` · **not deployed** · **0007 not applied**  
**Owner:** Cursor (partyperfect.app / Supabase app layer) · **Verifier:** Codex  
**Date:** 2026-08-13

Architecture unchanged: Mason/Josh iPhone → HTTPS partyperfect.app → private Supabase storage + durable queue → outbound Mac worker → Mike/Matter.

Shared Bearer password is **deprecated**. Device tokens are separate, hashed, revocable, Authorization-header only.

## APIs

| Action | Path | Auth |
|--------|------|------|
| CREATE | `POST /api/mike/intake` | Mason or Josh device Bearer |
| COMPLETE | `POST /api/mike/intake/complete` | same sender |
| STATUS | `GET /api/mike/intake/[id]` | same sender only |
| Worker lease/ack/fail/heartbeat | `/api/mike/intake/worker/*` | worker Bearer only |

CREATE returns short-lived signed upload info (no service credentials). COMPLETE confirms object exists, stores hash/metadata, marks `QUEUED`, returns **202**. Worker retries reuse `message_id` — this layer never creates a Matter task.

## Data (migration HELD)

`supabase/migrations/0007_mike_remote_intake.sql`

- private bucket `mike-intake-audio`
- `intake_devices` (SHA-256 verifiers only)
- `intake_commands` + unique `(sender_id, idempotency_key)`
- leases, attempt_count, dead-letter, retain_until
- `intake_events` + worker heartbeats
- RLS: service_role only; authenticated revoked

Do not apply until Mason says yes. Script: `MIKE_INTAKE_APPLY_0007=YES node --env-file=.env.local scripts/apply-0007-mike-intake.mjs`

## Env (secret store — names only)

`MIKE_INTAKE_MASON_TOKEN_SHA256` · `MIKE_INTAKE_JOSH_TOKEN_SHA256` · `MIKE_INTAKE_WORKER_TOKEN_SHA256` · optional `*_REVOKED` · existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `DATABASE_URL`

Hash helper: `printf '%s' "$TOKEN" | node scripts/hash-mike-intake-token.mjs`

Shortcut steps (placeholders only): `docs/TALK_TO_MIKE_SHORTCUTS.md`

## Tests

```
npx tsx scripts/test-mike-intake.ts
node scripts/test-api-auth-matrix.mjs
npx tsc --noEmit
npm run test:security
```

Coverage: unauthenticated, wrong token, revoked, Mason/Josh isolation, idempotent retry, key/content conflict, expired upload, oversized, invalid media, missing upload, duplicate complete, lease, worker retry (same command), dead letter, RLS SQL, log leakage, rate limits.

## Known limits

- Not deployed. Live Talk-to-Mike Mac loop is unchanged until 0007 + env + Shortcuts ship.
- Signed upload URL shape depends on live Storage API; memory store used in unit tests.
- Audio deletion after transcription is worker-driven (`deleteAudio: true` on ack) + `retain_until` metadata. No indefinite preserve.
- Cursor does not invoke Matter/Mike from these APIs.
