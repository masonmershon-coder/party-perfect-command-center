# PP-TIME-001 — Go-live readiness report

**Date:** 2026-08-14  
**Branch:** `agent/cursor/PP-TIME-001`  
**Status:** Ready for controlled live test **after Mason approval** — **do not** apply `0009` or switch off Square without explicit YES.

---

## 1. Production migrations required

| Item | Status |
|------|--------|
| `supabase/migrations/0009_pp_time.sql` | **HELD** — required for production Postgres (employees, punches, trusted_devices, evidence columns, queues, leave, settings) |
| Apply method | Mason-approved, `ON_ERROR_STOP=1`, single transaction — same pattern as prior migrations |
| Showroom location | Seeded **inactive / unverified** until Mason confirms lat/long |

## 2. Environment variables required

| Variable | Purpose |
|----------|---------|
| `TIME_SESSION_SECRET` | HMAC for `pp_time_session` / device cookies |
| `TIME_OFFICE_EGRESS_IPS` | Comma-separated office public IPs → `PARTY_PERFECT_NETWORK` match |
| `TIME_TRUST_PROXY` | Set `1` if not on Vercel (trusted `x-forwarded-for`) |
| `TIME_USE_REDIS=1` + Upstash Redis URL/token | Durable store when not on Postgres yet / preview durability |
| `TIME_MIKE_TOKEN_SHA256` | Mike read-only Bearer |
| `TIME_PREVIEW` | Preview-only behavior (omit on production) |
| Existing CC / DB / Vercel secrets | Unchanged |

## 3. Production URL

- **Target:** `https://partyperfect.app/time`
- **Preview (current):** `https://party-perfect-time-preview.vercel.app/time`
- `/time`: standalone role-aware app (employee / Shelly / Mason / Michelle)
- Command Center: optional Time & Payroll mirror over the same backend

## 4. Current employee migration status

- Seed demo roster present in the durable private Blob preview store (Jorge Arellano, Shelly, Michelle, Mason).
- **Production employee import from Square:** dry-run import path exists; **not cut over**. Live roster migration pending Mason approval + `0009`.

## 5. PIN migration status

- Existing **4-digit PINs** hashed at rest (`hashTimePin` / verify).
- UX: First + Last Name + PIN (no employee number in login UI).
- Rate limit / lockout / failed-auth audit in place for sessions.
- Production PIN import from Square Team: **pending** cutover approval.

## 6. Trusted-device security status

- Cookie `pp_time_device` (180d) = device identity — **not IP**.
- IP changes on same trusted device = evidence / LOW signal, not automatic theft.
- New / unrecognized device → MEDIUM+ review signals for Mason.
- Kiosk/shared: no personal trusted session (PIN each use).

## 7. GPS / IP evidence status

- Every app punch records: server timestamp, optional client time, GPS (+ accuracy/permission), public IP, office-network match, trusted device, reason codes, risk score, `reviewRequired`.
- Employees never see raw telemetry.
- Shelly ops views exclude IP/risk/device-fraud fields.
- Mason/Michelle: full `adminPunchDetail` via Security tab / `?evidence=full`.

## 8. iPhone install-flow status

- Branded walkthrough: Share → Add to Home Screen → Add.
- Standalone / `navigator.standalone` skips walkthrough.
- Manifest + Apple touch icon + 192/512/maskable icons.
- **Preview blocker:** Vercel Preview Deployment Protection may SSO-wall unauthenticated phones until Preview protection = **None**.

## 9. Android install-flow status

- Native `beforeinstallprompt` when available; guided fallback otherwise.
- Same `/time` scope + icons.

## 10. Shelly queue status

- **Ops-only:** Fix My Time, absences, time-off, clarifications, manager remarks, payroll-readiness cleanup, open-shift / open-lunch / forgotten clock-out exceptions.
- **Removed from Shelly:** punch security telemetry, IP, risk scores, impossible-travel, fraud flags.
- API: `/api/time/admin/requests` · UI: `/time` → Review / Time Off.
- Shelly administers employees, PIN resets, device onboarding, filtered timecards, and payroll readiness directly inside `/time`; Command Center is not required.

## 11. Mason / Michelle security-alert status

- API: `/api/time/admin/security` · UI: “Security · Mason/Michelle”.
- Severity: **LOW** (evidence only, no push) · **MEDIUM** (Mason) · **HIGH** (Mason + Michelle notification).
- Capability: `timekeeping.security` on Mason + Michelle seed; **not** on Shelly.
- Language: review signals only — never automatic accusation.

## 12. Mike read-only status

- `GET /api/time/mike/status` — Bearer or owner; **no writes**.
- Flags split: `shellyQueueOpen` vs `securityAlertsOpen` / `securityAlertsHigh`.
- Friday → remind Shelly (ops); `securityCheck` → remind Mason (security).

## 13. Automated test results

```
npm run test:time  →  All PP-TIME-001 checks passed (incl. role-separation)
npx tsc --noEmit   →  clean
```

## 14. Remaining blockers

| Blocker | Severity | Notes |
|---------|----------|-------|
| `0009` not applied to production | **Gate** | Wait for Mason YES |
| Square → PP Time employee/PIN cutover | **Gate** | Wait for Mason YES |
| Preview Deployment Protection SSO | Medium | Blocks real-phone preview testing until None |
| Showroom lat/long unverified | Medium | Location inactive until Mason verifies |
| Preview role QA | Medium | Run real-phone Shelly/Mason/Michelle role walkthrough after Preview Deployment Protection is disabled |

---

## Deployment stance

**Prepared for controlled live use in code.**  
**Not deploying to production / not applying migrations / not switching employees off Square** until Mason’s explicit approval.
