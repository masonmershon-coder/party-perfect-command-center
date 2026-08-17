# PP-TIME-001 verification bundle

**Codex:** `READY_FOR_VERIFICATION`  
**Deploy:** NOT AUTHORIZED  
**Migration 0009:** NOT APPLIED  
**Production Time tokens:** NOT PROVISIONED  
**Showroom coordinates:** NOT VERIFIED

## Provenance

- Branch: `agent/cursor/PP-TIME-001`
- Unrelated dirty AI-HANDOFF / golden-transaction files are **not** this change

## Shelly-first workflow

| Step | Actor | Action |
|---|---|---|
| 1 | Employee | Fix My Time / Report Absence / Request Time Off (never edit official punches) |
| 2 | Shelly | Review queue — original snapshot, employee note, clarify, remark, approve/deny, authorized correction |
| 3 | Michelle | Override if needed + final payroll ready |
| 4 | Paychex | Out of V1 (no send) |

Audit retains: original punch/time snapshot, employee request, employee note, Shelly remarks, approved correction, approver, timestamps.

## Schema additions (still in HELD 0009)

- `time_corrections`: `affected_date`, `approved_correction`, `needs_clarification`, `queue`
- `absences`: `reason` (employee) + `admin_class` (Shelly) — absence ≠ automatic PTO
- `time_off_requests` (future planned time off)
- `request_messages` (conversation attached to request)
- `notifications` (in-app employee updates)

## Routes (additive)

Employee: `/api/time/time-off`, `/api/time/messages`, `/api/time/notifications`  
Admin: `/api/time/admin/requests` = Shelly review queue + clarify/approve/deny  
Mike: `GET /api/time/mike/status` flags include pending corrections, absences awaiting, unanswered clarifications, incomplete timecards, time-off awaiting, Friday `remindShelly`, Monday blockers. **No writes.**

## PTO privacy

If ineligible: `leaveVisible: false`, empty banks, Leave tab hidden, copy “Nothing to show here right now.” Never “not eligible” / $0 balance / advertise benefit.

## Tests run (2026-08-14)

```
npm run test:time      # pass (incl. Shelly queue, absence≠PTO, leave privacy, time-off+notify+Mike flags)
npm run test:api-auth  # pass
npx tsc --noEmit       # pass
```

## Mason before go-live

1. Codex verify
2. Approve applying `0009`
3. Verify showroom lat/long
4. Provision `TIME_SESSION_SECRET` + `TIME_MIKE_TOKEN_SHA256` (env names only)
5. Explicit deploy approval
