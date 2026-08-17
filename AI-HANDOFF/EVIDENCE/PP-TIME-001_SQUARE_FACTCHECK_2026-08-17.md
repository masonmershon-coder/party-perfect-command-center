# PP-TIME-001 — Authenticated Square Fact-Check

**Date:** 2026-08-17  
**Mode:** READ-ONLY · no Square writes · no production import · no `0009`  
**Source package:** `~/Desktop/Party Perfect/13 - Build - Party Perfect Time/party-perfect-time-square-migration/`  
**Live session:** Square Dashboard authenticated (Mason); Team + Timecards verified in browser

---

## Executive summary

The **Aug 15 authenticated export package is real and materially better** than the earlier single-day probe. We now have:

- **46** normalized roster identities (28 current · 14 deactivated · 4 shift-history-only)
- **4,547** shift rows for **2026-01-01 → 2026-08-14** via official **Export shifts**

**Still NOT ready for cutover** because:

1. **Prior-year history not yet exported** (2025, 2024, …) — browser on Timecards shows 2025 year view available
2. **Shelly** and **Michelle Mershon** are **not Square identities** — PP-only admins
3. **Mason Mershon** appears in shift history but **not** on Team roster (active or deactivated in captured export)
4. **Michelle Saucedo ≠ Michelle Mershon** — must never merge
5. Square does **not** expose existing passcodes without explicit admin reveal — use `/time/pins`

---

## 1. Roster (Square Team)

| Metric | Count |
|---|---|
| Square roster rows (normalized) | **46** |
| Current (active/incomplete) | **28** |
| Deactivated | **14** |
| Shift-history-only (not on Team list) | **4** |

**Live browser confirm (2026-08-17):** Team members page shows current roster including **Jacob Mershon** (Active · Delivery Driver · PP Showroom), **Michelle Saucedo** (Active · Sales Associate), **CAYDEN MERSHON**, etc. Search **Shelly** → **No results**. Search **Mason** on current filter → not on current Team list.

### Key identity resolution

| Person | Square | PP Time role (authority = PP, not Square) |
|---|---|---|
| **Jacob Mershon** | ✅ Active Team · Delivery Driver | EMPLOYEE |
| **Mason Mershon** | ⚠️ **193 shifts in 2026 export** as `MASON MERSHON` · **NOT on Team roster** (active/deactivated captured) | TIME_ADMIN + SECURITY_ADMIN (PP-only) |
| **Michelle Mershon** | ❌ Not in Square Team or shifts | OWNER (PP-only) |
| **Michelle Saucedo** | ✅ Active Sales Associate | **Different person** — do not merge with Michelle Mershon |
| **Shelly** | ❌ Not in Square Team or 2026 shifts | TIME_ADMIN (PP-only) — last name **Showroom** is placeholder until Mason supplies legal name |

### Shift-history-only (historical punches, no Team profile)

- MASON MERSHON (MANAGER)
- Zachary Mershon
- Devine Washington
- Douglas Leiva

---

## 2. Time history (Export shifts)

**File:** `raw/authenticated-2026-08-15/shifts-export_2026-01-01_2026-12-31.csv`

| Metric | Value |
|---|---|
| Shift rows | **4,547** |
| Named shift rows | **4,473** |
| Unique employees in shifts | **39** |
| Date range | **2026-01-01 → 2026-08-14** |
| Break segments present | **3,819** |
| Overnight shifts (clock-out date ≠ clock-in date) | **116** |
| Regular hours (sum) | **31,156.17** |
| Overtime hours (sum) | **1,670.74** |
| Doubletime hours | **0** |
| Open/missing clock-out | **74** |
| Empty-name rows | **74** |
| Duplicate shift signatures | **0** |
| Wage columns | **Ignored** (not authoritative) |

**Live browser (2026-08-17):** Timecards page reachable at `/dashboard/shifts/timecards`; year selector shows **2025** with full-year range. Prior-year export still needed to measure retention limit.

---

## 3. Reconcile vs PP Time preview seed

| | Count |
|---|---|
| Square roster rows | 46 |
| PP Time preview seed identities | 5 |
| Exact name matches | **3** (Jacob Mershon, Jorge Arellano, Mason Mershon via shift-history name) |
| Missing from Square (PP-only) | Shelly Showroom, Michelle Mershon |
| Missing from PP seed (need create at cutover) | **43** Square employees |
| Ambiguous matches | **0** |
| Name mismatches resolved | Mason `M` → **Mershon** (Square uses MASON MERSHON in shifts) |

---

## 4. PIN / passcode check

| Check | Result |
|---|---|
| Plaintext PINs in export package | **None** |
| Square profile has Passcode field | **Yes** — with **Show Passcode** control |
| Existing passcodes revealed by default | **No** |
| Show Passcode clicked this session | **No** (credentials — not read) |
| PP Time path | Mason enters PINs via **`/time/pins`** (hashed server-side) |

---

## 5. Dry-run (no commit)

Command: `node scripts/time-square-dry-run.mjs` with 2026 full-year shifts file.

| # | Metric | Value |
|---|---|---|
| 1 | Exact employee count (Square roster) | **46** |
| 2 | Matched to preview seed | **3** |
| 3 | Unresolved PP-only identities | Shelly Showroom, Michelle Mershon |
| 4 | Historical shift count | **4,547** |
| 5 | Earliest date | **2026-01-01** |
| 6 | Latest date | **2026-08-14** |
| 7 | Break record count | **3,819** |
| 8 | Regular-hour total | **31,156.17** |
| 9 | Overtime total | **1,670.74** |
| 10 | Overnight-shift count | **116** |
| 11 | Malformed/open records | **148** (74 open clock-out + 74 empty name) |
| 12 | Duplicates detected | **0** |
| 13 | Records safe to import (estimate) | **4,473** |
| 14 | Records requiring human review | **148** |

---

## 6. Preview roster status

`lib/time/store.ts` preview seed already reflects fact-check:

- **Mason Mershon** (not `Mason M`) — notes Square shift-only presence
- **Jacob Mershon** — Square-backed employee
- **Michelle Mershon** — PP OWNER only; explicit note vs Michelle Saucedo
- **Shelly Showroom** — PP TIME_ADMIN only; not in Square

Roles remain PP-assigned; Square does not grant admin authority.

---

## 7. Remaining actions (Mason)

1. **Export shifts for 2025** (and prior years until empty): Timecards → year **2025** → Export → **Export shifts** (NOT labor cost). Save to migration `raw/authenticated-2026-08-17/` (local only — not Git).
2. **Team → Status → Deactivated** — confirm deactivated list matches captured export (14).
3. Confirm **Mason Mershon** Square status (removed from Team vs never added vs permissions-only).
4. Supply **Shelly legal last name** when ready (or keep PP-only identity).
5. Enter production PINs via **`/time/pins`** when cutover approved.

---

## Final gate

- ❌ Do not apply `0009`
- ❌ Do not shut off Square
- ❌ Do not write back to Square
- ❌ Do not production import yet

**Verdict:** Fact-check **substantially improved** vs single-day probe; cutover still **NOT READY** pending prior-year exports + PP-only identity confirmation + PIN entry.
