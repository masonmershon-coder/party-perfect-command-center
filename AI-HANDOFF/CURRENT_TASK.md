# CURRENT TASK

**TASK ID:** PP-TIME-001  
**STATUS:** CURSOR_WORKING → READY_FOR_CLAUDE_REVIEW (partial)  
**UPDATED:** 2026-08-17  

## Landed this cycle

### 1. Persistent trusted device + hidden admin menu
- Returning employees skip login when `pp_time_device` is valid
- Session slides on activity; IP is evidence-only
- No employee Sign Out / Switch Account
- Logo **press-and-hold 4s** → Admin/Support gate (diagnostics for employees; Switch/Sign-out for admins)

### 2. Shadow Mode scaffolding
- Default `shadowMode: true` — Square remains punch authority
- Labor API sync client + hourly cron route + admin sync status banner
- CSV import now preserves lunch break punches
- PP corrections survive sync (SYNC_CONFLICT)

**Shadow Mode NOT READY** until Square token has TIMECARDS_READ and first sync is HEALTHY.

Evidence: `AI-HANDOFF/EVIDENCE/PP-TIME-TRUSTED_DEVICE_SHADOW_MODE_2026-08-17.md`

### Still blocked / open
- History through **today (2026-08-17)** not complete (last CSV ends 2026-08-14)
- Prior-year exports still needed for full history
- `0009` HELD — no production cutover
- Employees remain on Square during Shadow Mode

Tests: `npm run test:time` — all passed
