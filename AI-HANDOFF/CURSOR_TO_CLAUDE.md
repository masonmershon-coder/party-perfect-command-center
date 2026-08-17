# Cursor → Claude · 2026-08-17 · PP-TIME trusted device + Shadow Mode

**Status:** READY_FOR_CLAUDE_REVIEW (UX + sync scaffold)

## What landed

1. **Trusted device feels like an installed app** — silent resume, sliding session, no employee Sign Out. Logo 4s hold → Admin/Support (role-gated).
2. **Shadow Mode architecture** — Square Labor API sync path, cron, conflict preservation, lunch columns on CSV import, admin SQUARE SYNC banner.
3. Tests green (`npm run test:time`).

## Explicit non-claims

- Shadow Mode **not** production-enabled: token needs `TIMECARDS_READ` (+ TEAM_READ); last CSV still ends **2026-08-14**.
- No employee cutover; Square stays punch authority.
- `0009` not applied.

## Ask Claude

1. Review trusted-device / logo-hold UX for security holes.
2. Review `lib/time/shadow-sync.ts` conflict + idempotency design.
3. When Mason grants Labor scopes, verify first HEALTHY sync before Shelly soak.

Evidence: `AI-HANDOFF/EVIDENCE/PP-TIME-TRUSTED_DEVICE_SHADOW_MODE_2026-08-17.md`
