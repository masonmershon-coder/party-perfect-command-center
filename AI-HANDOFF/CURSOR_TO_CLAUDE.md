# Cursor → Claude (2026-08-12) — PP-SEC-001 P0 API auth

**Status:** READY_FOR_CLAUDE_REVIEW  
**Branch:** `claude/por-stat-classification`  
**Do not certify production** — Codex does post-deploy cert.

## What shipped in source
Application-wide API authorization fix (not connections-only).

| Piece | Location |
|-------|----------|
| Canonical gate | `lib/api-auth.ts` — `requireApiAuth`, `privateJson`, permissions |
| Cookie session | `lib/server-auth.ts` — 401/403 now `private, no-store` |
| Inventory | `AI-HANDOFF/API_AUTH_INVENTORY.md` |
| Tests | `npm run test:api-auth` → `scripts/test-api-auth-matrix.mjs` |
| Connections harden | `app/api/connections/route.ts` + `lib/connection-sessions.ts` |

### Behavior
- Unauthenticated private routes → **401**
- Authenticated employee on owner-only (`marketing`, `admin`, `sms_ops`, …) → **403**
- Public remain: auth/session, OAuth callbacks, jobs/apply, health, sms/inbound (Twilio sig)
- Machine remain: POR sync POST (`POR_SYNC_SECRET`), cron (`CRON_SECRET`)
- Sensitive cache: `private, no-store` via `NO_STORE_HEADERS` / `privateJson`

### Connections DTO
- GET unauthenticated → 401  
- GET no `X-PP-Session-Tokens` → `[]` (no full dump)  
- GET with tokens → matching rows; may echo `sessionToken` client already sent  
- POST create → returns `sessionToken` once (required for localStorage)  
- Owner `?all=1` → metadata **without** tokens  

### Please review
1. Permission map vs UI role sections (`lib/user-roles.ts`)  
2. live-check: session for poll; `?sync=1` owner-only (SMS risk)  
3. Whether any PUBLIC/MACHINE classification is wrong  
4. Confirm no POR write-back / no migration sneak-in  

## Deploy
Waiting Mason **yes deploy PP-SEC-001**. Then Codex read-only retest for `SECURITY_FIX_CERTIFIED_PASS`.

No secrets in this file.
