# PP-TIME-001 — Pre-live cutover readiness

**Updated:** 2026-08-15  
**Verdict:** **NOT READY FOR CONTROLLED LIVE CUTOVER** — blockers below.  
Square remains live. `0009` not applied. No production promotion.

## Implemented this pass

1. **Late Night tracking** — window 7:00 PM–6:00 AM America/Chicago; one occurrence per shift (no double-count overnight); Regular/OT unchanged; fee amount `null` until Mason configures via owner payroll action `configure_late_night_fee`.
2. **Role matrix** — Shelly: review/employees/payroll (no security). Mason: Shelly ops + security/admin (no `timekeeping.owner` finalize). Michelle: owner superset including finalize/security/payroll.
3. **Mobile Review layout** — stacked dt/dd on narrow screens; humanized labels; Fix My Time labeled fields; long text wraps.
4. **Secure PIN entry** — `/time/pins` (unchanged path); no plaintext PINs in Git/handoff.
5. **Location at punch only** — locked prior rule retained.
6. **History** — employee punches show `Imported from Square` when `source=import`.
7. **Square dry-run tooling** — `scripts/time-square-dry-run.mjs`.

## Dry-run results (available Square package)

| Item | Result |
|------|--------|
| Source employees | 30 |
| Matched to preview seed | 1 (`Jorge Arellano`) |
| Missing in seed (need create on cutover) | 29 including `Jacob Mershon` |
| Ambiguous | 0 |
| Seed identities missing in Square CSV | Shelly Showroom, Michelle Mershon, Mason M (preview placeholders / name mismatch) |
| Historical shift rows | **24** on **2026-08-14 only** |
| Complete history claim | **NO** — single-day probe export only |
| Wage columns | Ignored |
| PIN plaintext in package | **None** |

## Production migration list (when Mason says YES)

1. Resolve roster names (Shelly last name; Mason `Mershon` vs `M`; Michelle vs Michelle Saucedo ambiguity risk).
2. Mason enters existing PINs via `/time/pins` (hashed only).
3. Obtain full multi-year Square `Export shifts` (not just 2026-08-14).
4. Apply `0009_pp_time.sql` only with explicit YES.
5. Commit Square import with `source=import` (no fraud backfill).
6. Set late-night fee amount (owner).
7. Keep Square live in parallel until Mason confirms cutover.

## URLs

- Preview: https://party-perfect-time-preview.vercel.app/time  
- Secure PIN entry: https://party-perfect-time-preview.vercel.app/time/pins  
- Production URL (future): https://partyperfect.app/time — **not cut over**

## Role verification (automated)

`npm run test:time` — passed including final role matrix + late-night + location-at-punch.

## Mobile layout

CSS/layout fixes landed for Review detail + Fix My Time labels. Visual iPhone/Android pass still needed on preview by Mason.

## Remaining blockers

1. Square historical exports incomplete (one day).
2. Roster not reconciled for real identities (Shelly/Mason/Michelle/Jacob naming).
3. PINs not entered via secure admin workflow yet.
4. Late-night fee amount unset.
5. Vercel Preview Deployment Protection may SSO-wall phones.
6. `0009` HELD; Square must stay on.
7. Controlled live cutover not authorized.
