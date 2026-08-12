# PP-SEC-001 deploy evidence

**Deployed commit:** `ddfadc10208ce56bdd926d63c1a695de85959d59`  
**Branch:** `deploy/pp-sec-001` (isolated from POR/feature dirty tree; based on `main`)  
**Production alias:** https://partyperfect.app → `party-perfect-command-center-c3vw22vgq-party-perfect.vercel.app`  
**Promote:** also aliased www + vercel.app; `vercel promote` created follow-on deployment `2XdoEQgv11RHwyjFFTQwLJbDcvpr`  
**Deployed at:** 2026-08-12T21:45Z–21:48Z

## Scope shipped
- `lib/api-auth.ts` + route `requireApiAuth` gates
- connections token redaction
- `private, no-store` on auth failures / privateJson
- `npm run test:api-auth` matrix
- No POR STAT / kits / migrations / credential rotation

## Cursor read-only production smoke (unauthenticated GET)
Observed after alias cutover:
- Sampled private routes return **401** with `Cache-Control: private, no-store, max-age=0, must-revalidate`
- Includes: `/api/connections`, `/api/agents`, `/api/tasks`, `/api/catch-up`, `/api/design*`, `/api/live-check`, `/api/marketing`, `/api/social`, `/api/meta/setup`, `/api/por/catalog/search`, `/api/bookkeeping`, `/api/stats`, `/api/reports`, `/api/send-sms`
- `/api/auth/session` remains reachable for login probe
- `/api/health` remains public
- Cursor did **not** self-certify and did **not** run unauthenticated write probes (Codex owns that)

## Unverified (Codex must check)
- 403 for employee on owner-only routes
- connections response never improperly exposes sessionToken
- unauthorized POST/PUT/PATCH/DELETE denied
- deployed commit matches reviewed source
- login/session still works for authorized users
