# PP-TIME-001 — Authenticated Square fact-check (2026-08-15)

**Session:** READ-ONLY fact-check + official export + reconcile  
**Gates held:** no `0009`, Square left live, no Square writes, no production import, no Show Passcode click, no credentials stored.

## Exports captured (local migration workspace only — not Git)

| File | Coverage | Rows |
|------|----------|------|
| `raw/authenticated-2026-08-15/shifts-export_2026-01-01_2026-12-31.csv` | 2026-01-01 → 2026-12-31 (Year preset) | **4547** shift rows |
| Prior single-day probe | 2026-08-14 only | 24–25 |

**Still needed:** Export shifts for **2025**, then **2024**, … until a year returns empty (measures retention). Browser year-step is ready on Timecards (`2025` was selected); export click needs Mason approval/manual click (auto-export was blocked mid-session after 2026 succeeded).

## Roster (Square Team members)

| Filter | Count |
|--------|-------|
| All current | **28** |
| Current + Deactivated | **42** |
| Plus shift-history-only identities | **+4** (see below) |

Normalized (no wages): `normalized/employees.csv` (46 rows including shift-only).

### Key identity resolution

| Person | Square finding | PP Time action |
|--------|----------------|----------------|
| **Jacob Mershon** | Team **Active**, Delivery Driver, PP Showroom | Exact match → preview **EMPLOYEE** (`emp-jacob`) |
| **Mason Mershon** | **193** shifts in 2026 as `MASON MERSHON` / MANAGER — **NOT** on Team list (active or deactivated) | Preview `Mason M` → **`Mason Mershon`**; keep **TIME_ADMIN + SECURITY_ADMIN** (PP authority, not Square) |
| **Michelle Mershon** | **Absent** from Team + 2026 shifts | Keep PP **OWNER**. Do **not** merge with **Michelle Saucedo** (Active Sales Associate) |
| **Shelly** | **Absent** from Team + 2026 shifts (search “Shelly” = no results) | Keep PP **TIME_ADMIN**; last name still placeholder `Showroom` until Mason supplies legal name |

### Shift-history-only (not on Team roster)

- MASON MERSHON (193)
- Zachary Mershon (170)
- Devine Washington (158)
- Douglas Leiva (2)
- 74 empty-name open rows (no clock-out) — human review

## PIN / passcode (read-only)

On Jacob Mershon profile Permissions: label **PASSCODE** with control **Show Passcode**.

- Square does **not** reveal existing passcodes by default.
- We did **not** click Show Passcode.
- Use Mason’s PIN sheet + `/time/pins` (hash server-side).

## Dry-run (`npx tsx scripts/time-square-dry-run.mjs`)

1. Exact employee count (normalized source): **46** (42 Team + 4 shift-only)  
2. Matched roster to preview seed: **3** (Jorge Arellano, Jacob Mershon, Mason Mershon)  
3. Unresolved / PP-only vs Square: Shelly Showroom, Michelle Mershon (expected); 43 Square people not yet in preview seed  
4. Historical shift count: **4547** (2026 year file)  
5. Earliest available date (this file): **2026-01-01**  
6. Latest available date (this file): **2026-08-14**  
7. Break record count: **3819**  
8. Regular-hour totals: **31156.17** (named rows; wages ignored)  
9. Overtime totals: **1670.74**  
10. Overnight-shift count: **116**  
11. Malformed/open: **148** (74 missing clock-out + 74 empty name)  
12. Duplicates detected: **0** exact punch signatures  
13. Records safe to import (estimate): **4473**  
14. Records requiring human review: **148**  

Doubletime: **0**.

## Preview seed updates (code)

- `lib/time/store.ts`: Mason lastName `M` → `Mershon`; added `emp-jacob`; notes clarifying Michelle ≠ Saucedo; Shelly still pending last name.
- PP roles unchanged: Shelly TIME_ADMIN · Mason TIME_ADMIN+SECURITY · Michelle OWNER · Jacob EMPLOYEE.

## Explicit non-actions

- Did not apply `0009`
- Did not shut off Square
- Did not write back to Square
- Did not modify Square employees/timecards
- Did not production-import
- Did not store credentials/cookies/tokens
- Did not commit raw CSV to Git
