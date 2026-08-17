# PP-TIME-001 — Cursor evidence

**Status:** `READY_FOR_VERIFICATION` · **Not deployed** · **0009 HELD**  
**Branch:** `agent/cursor/PP-TIME-001`

Party Perfect Time V1 + Shelly-first workflow update.

## Workflow

EMPLOYEE → SHELLY CLEANUP → MICHELLE FINAL PAYROLL → PAYCHEX

- Employees never edit official timecards
- Fix My Time / Report Absence / Request Time Off → Shelly review queue
- Michelle override + final payroll; routine cleanup does not flood Michelle
- Absence reasons are simple (Sick / Vacation / Personal / Other); paid leave is administrative
- PTO/vacation UI only when eligible — never advertise the benefit
- In-app notifications + clarification conversations attached to each request
- Mike monitors queues read-only (Friday Shelly reminder; Monday payroll readiness)

## Tests

```
npm run test:time
npm run test:api-auth
npx tsc --noEmit
```

All passed 2026-08-14. Bundle: `AI-HANDOFF/EVIDENCE/PP-TIME-001_VERIFICATION_BUNDLE.md`
