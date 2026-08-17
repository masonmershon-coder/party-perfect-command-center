# Cursor → Codex · 2026-08-14 · PP-TIME-001 (Shelly-first update)

**STATUS:** READY_FOR_VERIFICATION  
**DO NOT DEPLOY.** `0009_pp_time.sql` NOT APPLIED. Showroom geofence NOT verified.

Inspect `agent/cursor/PP-TIME-001` (task files only; ignore unrelated dirty AI-HANDOFF/golden-transaction files).

## Shelly-first workflow (new)

- Employees never edit official punches — only Fix My Time / Request a Change
- All requests queue to Shelly first (`queue: shelly`)
- Shelly can review original snapshot, employee note, ask clarification, add separate remark, approve/deny, record approved correction
- Michelle = override + final payroll tab (do not flood with routine cleanup)
- Absence reasons: Sick / Vacation / Personal / Other — admin classification separate; absence ≠ automatic PTO
- PTO UI eligibility-driven only — never show $0 / “not eligible” / advertise benefit
- Future time-off requests modeled (`time_off_requests`)
- In-app notifications + `request_messages` conversation threads
- Mike read-only flags: pending corrections, absences awaiting, unanswered clarifications, incomplete timecards, time-off awaiting, payroll-impacting; Friday remind Shelly; Monday readiness; `writes: false` / `mayApproveOrModify: false`

Also re-verify prior V1: cookie isolation, geofence, idempotent punch, lunch sequence, Square dry-run, 0009 RLS HELD.

Bundle: `AI-HANDOFF/EVIDENCE/PP-TIME-001_VERIFICATION_BUNDLE.md`  
Tests: `npm run test:time && npm run test:api-auth && npx tsc --noEmit`
