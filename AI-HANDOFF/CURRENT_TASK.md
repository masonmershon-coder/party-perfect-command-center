# CURRENT TASK

**TASK ID:** PP-SEC-001 — P0 API authorization lockdown  
**STATUS:** READY_FOR_CLAUDE_REVIEW (+ WAITING_FOR_MASON on prod deploy)  
**UPDATED:** 2026-08-12  
**BRANCH:** `claude/por-stat-classification`

## Done (source — not yet production)
- Inventory: `AI-HANDOFF/API_AUTH_INVENTORY.md` (74 routes)
- Canonical gate: `lib/api-auth.ts` → `requireApiAuth(permission)` + `privateJson` + permission map
- 401/403 responses carry `Cache-Control: private, no-store`
- Formerly-open Codex samples gated (connections, catch-up, agents, tasks, design*, live-check, marketing, social, meta/setup, por/catalog/search, …)
- `/api/connections`: auth required; empty tokens → []; list does not dump store; `sessionToken` only on create or when client already sent tokens
- POR sync GET session-gated; POST still `POR_SYNC_SECRET`
- Tests: `npm run test:api-auth` **PASS**
- No migrations · no POR write-back · no credential rotation yet

## Rotation note (for Mason)
Exposed connection `sessionToken` values are opaque connection ids (not CC cookie / not Twilio / not DB). After deploy they are useless without a logged-in session. Optional hygiene: disconnect/reconnect email+social accounts in Command Center. **Do not** rotate `AUTH_PASSWORD` / `SESSION_SECRET` / Twilio unless Mason requests.

## Next
1. Claude review of auth architecture  
2. Mason **yes deploy PP-SEC-001** to production  
3. Codex independent retest → `SECURITY_FIX_CERTIFIED_PASS`
