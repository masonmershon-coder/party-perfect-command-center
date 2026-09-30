# CURRENT TASK

**TASK ID:** PP-TIME-SHADOW-MODE-P0  
**STATUS:** WAITING_FOR_MASON (Square Preview env still missing after Mason “set” signal)  
**UPDATED:** 2026-08-17  

Mason replied: Preview Square env is set. Cursor re-pulled **party-perfect-command-center Preview** (names only):

- `SQUARE_ACCESS_TOKEN` MISSING  
- `SQUARE_LOCATION_ID` MISSING  
- `SQUARE_ENV` MISSING  
- `CRON_SECRET` MISSING on Preview (PRESENT on Production only)  
- `SQUARE_TIME_WRITE` MISSING (correct — writes stay off)

No redeploy. No live Square sync. No Square writes. `0009` HELD. Employees stay on Square.

Public preview still: `https://time-preview.partyperfect.app/time` SHA `e9f31c8` / `dpl_Bi1bhV5RqMz1PoUSfaRS45WktMHn`.

## Data freshness — read before quoting any POR number

`node AI-HANDOFF/brain-status.mjs`

Sources are graded LIVE / STALE / FROZEN by age. **Never present a FROZEN source's
figures as current** — state the cutoff date or decline. As of 2026-09-30 the
transaction detail is 50 days frozen while the ops snapshot beside it is minutes
old. Fix: `AI-HANDOFF/BRAIN_LIVE_DATA_RUNBOOK.md`
