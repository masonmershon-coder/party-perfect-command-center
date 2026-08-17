# CURRENT TASK

**TASK ID:** PP-TIME-SHADOW-MODE-P0  
**STATUS:** SHADOW_MODE_REMEDIATION_BLOCKED (Square Labor env)  
**UPDATED:** 2026-08-17  

## Done

- Preview reachable without Vercel SSO: `https://time-preview.partyperfect.app/time`
- TS2367 factcheck fix; tsc clean
- Auth matrix recognizes `requireTimeAdmin`; Time admin routes use Time session + area caps
- PIN lockout durable (Redis / durable JSON)
- Correction vs resync tests green
- Shadow sync + parity scripts ready (Labor API)

## Blocked

`SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID` not available in this environment → cannot prove live Square through **2026-08-17**.

## Holds

`0009` not applied · Square still punch authority · no employee production cutover

Evidence: `AI-HANDOFF/EVIDENCE/PP-TIME-SHADOW_MODE_REMEDIATION_2026-08-17.md`
