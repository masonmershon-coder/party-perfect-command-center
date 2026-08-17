# PP-TIME Shadow Mode remediation — 2026-08-17

**Candidate SHA (this package):** see git HEAD on `agent/cursor/PP-TIME-001`  
**Codex prior SHA:** `ad5e8b680424aca55ba8828a0175eb33b6c25388`  
**0009:** NOT APPLIED · **Square punch authority:** unchanged · **Employee production:** NOT cut over

## P0-1 Preview access

| | |
|--|--|
| PREVIEW_PUBLICLY_REACHABLE | **YES** at `https://time-preview.partyperfect.app/time` |
| HTTP RESULT | **200** (no Vercel SSO) |
| TIME LOGIN SCREEN VISIBLE | **YES** |
| `party-perfect-time-preview.vercel.app` | Still SSO (`all_except_custom_domains`) — do not use for Mason/Shelly/Michelle |

Fix: custom domain on owned `partyperfect.app` (Vercel NS). Did **not** disable SSO on all `*.vercel.app` Command Center previews.

## P0-2 TypeScript

`lib/time/factcheck.ts`: removed always-true compare against already-narrowed `who_worked_on_date`.  
`npx tsc --noEmit` → 0 errors.

## P0-3 Auth matrix

Scanner missed `requireTimeAdmin`. Routes were gated; leftover `requireTimekeepingAdmin` was CC-owner-only (Shelly Time session would fail).

All Time admin routes now call `requireTimeAdmin(request, area)`.

| Route | Area | Unauth (no/invalid Time session) | Jorge (employee) | Shelly | Mason | Michelle |
|-------|------|----------------------------------|------------------|--------|-------|----------|
| `/api/time/admin/overview` | overview | 401 via Time session or CC | 403 | 200 | 200 | 200 |
| `/api/time/admin/requests` | review | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/employees` | employees | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/pins` | employees | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/timecards` | review (security if fullEvidence) | 401 | 403 | review 200 / security 403 | 200 | 200 |
| `/api/time/admin/payroll` GET | payroll | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/payroll` finalize | owner | 401 | 403 | 403 | 403 | 200 |
| `/api/time/admin/security` | security | 401 | 403 | 403 | 200 | 200 |
| `/api/time/admin/sync` | review | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/factcheck` | review | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/locations` | overview | 401 | 403 | 200 | 200 | 200 |
| `/api/time/admin/import` | review | 401 | 403 | 200 | 200 | 200 |

`node scripts/test-api-auth-matrix.mjs` = PASS

## P0-4 / P0-5 Square live sync

Code: Labor API read-only, roster upsert, open stays OPEN, hourly cron in `vercel.json`.  
**Runtime:** `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` **not present** in local `.env.local`. Observed Vercel env list on 2026-08-17 did not show Square Labor vars.

`scripts/time-square-parity.mjs` exits NOT_CONFIGURED without those env names.

SQUARE CURRENT THROUGH = **unknown (API not configured)**; last verified CSV still **2026-08-14**.

## P0-6 Correction proof

Synthetic integration in `scripts/test-time.ts`:

- CORRECTION_SURVIVES_RESYNC = **YES**
- CONFLICT_CREATED = **YES**
- SILENT_OVERWRITE = **NO**

## P0-7 PIN lockout

`lib/time/rate-limit.ts` uses Redis when durable Redis is configured, else shared `writeDurableJson`, else memory. No PIN plaintext. Audit `auth.failed` retained.

## P0-8 Mobile smoke

iPhone 390×844 and Android 412×915: login, preview banner, fields, Sign in, Shared device — no overlap. Full Shelly/Michelle walkthrough needs PINs on preview roster (not completed here).

## Holds

No `0009`. No Square writes. No employee production cutover.
