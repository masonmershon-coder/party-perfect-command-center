# PP-TIME — Trusted Device Persistence + Shadow Mode

**Date:** 2026-08-17  
**Status:** Code landed · Shadow Mode **NOT fully enabled** until Square Labor scopes verified

---

## A. Persistent trusted device + hidden admin menu

### Behavior

| Moment | What happens |
|---|---|
| First setup | First + Last + PIN → trusted device registered → `pp_time_device` (180d) + `pp_time_session` (12h) |
| Return on same phone | Session probe / device remember → clock screen **without** login form |
| Boot | Brief “Opening…” — no login flash while cookies resolve |
| Ordinary employee UI | **No** Sign Out / Switch Account |
| Logo hold 4s | Opens **Admin / Support Access** |
| Employee discovers gesture | Diagnostics only — **no** admin actions |
| Shelly / Mason / Michelle | Switch Account + Sign Out This Device (clears device cookie) |
| Device revoke | Existing Employees admin: Reset Device / revoke bumps `credentialsVersion` |

### Security

- Identity = trusted device UUID + HMAC cookie — **not public IP**
- IP / GPS / network still captured on every **punch** as evidence
- Cookies: HttpOnly, SameSite=Lax, Secure in production
- Session slides on `/api/time/me`, session GET, and punches while device remains valid
- Server revocation still clears both cookies

### Files

- `lib/time/auth.ts`, `lib/time/http.ts`, `app/api/time/session|me|punch`
- `app/time/time-logo-support.tsx`, `time-app.tsx`, `time.css`

---

## B. Shadow Mode / continuous Square sync

### Design

| Rule | Implementation |
|---|---|
| Authority | Square = punch source · PP Time = management layer (`shadowMode: true` default) |
| Direction | Square → PP Time only |
| Method | **Square Labor Timecards API** `POST /v2/labor/timecards/search` (not browser scraping) |
| Frequency | Hourly cron `GET /api/cron/time-square-sync` + Bearer `CRON_SECRET` |
| Idempotency | Stable shift id from Square timecard id + punch keys `square:tc:{id}:*` |
| Open shifts | Synced as OPEN / ON_LUNCH — no invented clock-out |
| Lunches | Breaks → lunch_start / lunch_end punches |
| PP corrections | Shifts with `employeeCorrectionId` / pending_correction **not** overwritten → `SYNC_CONFLICT` audit |
| AI cost | **$0** — no LLM in sync path |

### Enabling gate (Mason)

Current payment-link `SQUARE_ACCESS_TOKEN` may **lack** `TIMECARDS_READ` / `TEAM_READ`.

Until scopes are granted and a successful sync returns HEALTHY:

```
MANAGEMENT SHADOW MODE READY = NO
```

Admin UI shows **SQUARE SYNC** banner + “Run Square sync now”.

### Not done in this pass

- Full history through 2026-08-17 (still needs prior export / successful Labor pull)
- Production cutover / disable Square for employees
- Applying `0009` without Mason YES

---

## C. Report for Mason (Shadow Mode pre-enable)

```
SQUARE INTEGRATION METHOD = Square Labor Timecards API (SearchTimecards) + Team Members search
SUPPORTED API/WEBHOOK/EXPORT METHOD = API preferred; labor.timecard.updated webhook available later; CSV Export shifts remains fallback
SYNC FREQUENCY = hourly (cron) when configured
LAST SYNC = never (NOT_CONFIGURED until Labor scopes work)
HISTORY CURRENT THROUGH = 2026-08-14 (last verified CSV) — NOT through today until sync/export completes
CURRENT EMPLOYEE COUNT = (from last CSV roster) 46 Square identities + PP-only admins
CURRENT OPEN SHIFTS = unknown until first HEALTHY sync
CURRENT BREAKS = CSV path now preserves break columns; API path maps Square breaks
SYNC CONFLICT HANDLING = skip overwrite + audit SYNC_CONFLICT
IDEMPOTENCY VERIFIED = yes in unit design (stable ids / punch keys)
FAILURE RECOVERY VERIFIED = keeps last-known; marks DELAYED/FAILED; retries from checkpoint
ESTIMATED MONTHLY INTEGRATION COST = $0 beyond existing Square account
AI/API COST PER SYNC = $0 (no LLM)
MANAGEMENT SHADOW MODE READY = NO
```

**Next Mason action:** Confirm Square app token has **TIMECARDS_READ** (+ TEAM_READ). Then run “Run Square sync now” in Time Admin. When health = HEALTHY, Shadow Mode is ready for Shelly/Michelle soak while employees stay on Square.
