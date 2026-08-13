# Claude → Cursor: POR Parity Implementation Packets

**From:** Claude (POR archaeologist / specification) · **To:** Cursor (implementation) · **Verifier:** Codex
**Date:** 2026-08-13 · **Authoritative spec:** `00 - Reference/POR_COMMAND_CENTER_PARITY_MATRIX.md`

> Every packet below is **VERIFIED against real POR data** — row counts and exact-match tests included so you can re-derive them.
> **POR is the specification.** If your implementation disagrees with POR, POR wins and it is a defect to fix, not a design choice.
> Do not invent business logic. If a packet is ambiguous, mark the task `BLOCKED` with the question rather than guessing.

---

## PKT-1 · `POR-PARITY-WAIVER-BASE-001` — damage waiver base 🔴 over-charging today

**Verified:** `Transactions.DMG` across 31,168 tickets. On tickets carrying both rent and sale:
`DW = 5% of RENT` → **11,567 exact matches** · `DW = 5% of (RENT+SALE)` → **16**.

**Spec**
- Waiver = **5% of the RENT subtotal only**. Sale/merchandise lines are **excluded**.
- Waiver is **declinable per ticket** (`AskDamageWaiver=True`; 2,011 tickets carry rent with no waiver).
- Honor exemption: `DamageWaiverExempt` is set on 1,969 tickets.
- Basis is the **non-discounted** amount (`DWonNonDiscAmt=True`).
- Waiver is **not taxed** under TaxCode 1 (`TaxDW1` empty).
- POR stores a per-line `TransactionItems.DmgWvr` — keep the line-level concept intact.

**Current defect:** the engine applies 5% to the product subtotal including merchandise.
**Done when:** a quote containing both rental and sale items computes waiver on rent only, and totals match a real POR ticket to the penny.

## PKT-2 · `POR-PARITY-TAXCODE-001` — tax follows the customer 🔴

**Verified:** `CustomerFile.TaxCode` populated on **13,823 of 13,823** customers (100%). `TaxTable` holds 10 codes; code 1 = `TaxRent1 = TaxSale1 = 0.08517`, `TaxDW1` empty. Code 3 ("Osage Co") = 0.0575 **and** taxes the waiver at 0.05.

**Spec**
- Resolve tax from the **customer's** `TaxCode` → `TaxTable`, never a hardcoded constant.
- Apply `TaxRent*` to rent and `TaxSale*` to sale separately — POR stores them as distinct columns.
- Apply `TaxDW*` to the waiver **only when that code sets it** (code 1 does not; code 3 does).
- Surface `TaxExemptNumber` when present (238 customers).

**Current defect:** a single store-wide 8.517% is assumed. Any Osage County customer is taxed wrong today.

## PKT-3 · `POR-PARITY-NOTES-001` — seven notes fields, seven destinations 🔴

**Verified usage in real data:**

| POR destination | Populated |
|---|---|
| `Transactions.Notes` | 66.9% |
| `Transactions.DeliveryNotes` | 52.8% |
| `Transactions.PickupNotes` | 49.3% |
| `TransactionItems.Comments` | 13.8% (43,862 lines) |
| `TransactionItems.Desc` | 1.4% |
| `CustomerJobSite.SiteNotes` / `SiteDeliveryInstructions` | 749 sites |
| `CustomerComments.COMMENTS1` | 480 customers |

**Spec**
- Each field maps **1:1** to its POR column. Never merge.
- The UI **may** present them cleverly (tabs, contextual prompts, progressive disclosure) — the *semantic destination* must stay correct.
- Delivery notes and pickup notes are read by different people. Merging them would corrupt meaning on ~half of all tickets.
- Job-site and customer notes are **read-only context** in the quote screen, not new inputs.

## PKT-4 · `POR-PARITY-JOBSITES-001` — saved job sites (pure UX win)

**Verified:** 749 `CustomerJobSite` records with `SiteAddress/City/Zip`, `SiteNotes`, `SiteDeliveryInstructions`, `ContactName`, `ContactPhone`. `Transactions.JobSite` populated on **99.8%** of tickets.

**Spec:** on customer select, offer their saved job sites; selecting one prefills address, contact and standing delivery instructions. No new business logic — this is retyping elimination.

## PKT-5 · `POR-PARITY-SALESMAN-001` — real salesperson list

**Verified:** `Transactions.Salesman` populated on **99.8%** of tickets; a `Salesman` table exists (17 rows).

**Spec:** replace the free-text sales-rep field with a picker sourced from POR's `Salesman` table. Effectively mandatory in practice even though POR does not enforce it.

## PKT-6 · `POR-PARITY-STATUS-001` — plain-English statuses

**Verified:** `STAT` is **two characters**: char 1 = `TransactionStatus`, char 2 = `TransactionSecondaryStatus`. A **blank** primary means *Completed* — never `LTRIM` before reading char 1 (it corrupts 54.8% of rows).

**Spec:** decode both characters and display plain English ("Reservation", "Quote — converted", "Closed — cancelled"). Scope predicates already exist in `por-sync-agent/PorStatus.ps1`; mirror them, do not re-derive.

**Note:** this is why the dashboard reports **0 deliveries today** when POR has **4**. No live reservation carries a bare `'R'`.

## PKT-7 · `POR-PARITY-KITS-001` — kit expansion (already built, needs UI)

**Verified:** `ItemFile.TYPE='K'` = *Rental - Package*; kit headers carry qty 0 / rate 0 **by design** and resolve through `ItemKits` (`Num` → `ItemKey`) to real `TYPE='T'` components.

**Spec:** `lib/por-kits.ts` already expands kits and preserves the kit name for grouping. The UI must **let the operator choose a component** — POR requires the selection and never auto-picks. `requiresSelection` is set for you.

## PKT-8 · `POR-PARITY-HOLDS-001` — quote inventory holds

**Verified:** `HoldQuoteContracts = True`, `HOLD_DAYS = 4`.

**Spec:** POR holds stock for quotes for 4 days. Command Center does not model this, so our availability is **more optimistic than POR's**. Mirror the hold, or clearly label availability as "not including quote holds". ⚠️ Runtime behavior unobserved — mark `BLOCKED` if the exact semantics matter before you can confirm them in Counter.

---

## Rules for every packet

1. **POR wins.** A disagreement is a defect in Command Center, not a POR quirk to route around.
2. **No new required fields.** POR does not require them; do not make the girls fill in more than they do today.
3. **No invented pricing.** Waiver %, minimums, delivery fees, tax — all sourced from POR (see the matrix).
4. **No writes to POR.** There is no write path. Command Center mirrors and prepares; a CC quote is not a POR quote until POR contains it.
5. **UI improvements are welcome** — faster search, images, fewer clicks, better grouping. Business meaning stays identical.
6. When done, move the task to `READY_FOR_VERIFICATION`; Codex verifies against POR independently.

## Not yet specified — do not build

Delivery/setup fee selection (SKU-driven; packet pending) · rental minimum adjustment ($300 Tulsa / $1,500 out of town, packet pending) · pack/rack rounding (**UNKNOWN — may be floor practice**) · printing (blocked on Crystal/ENTERPRISE) · anything requiring a POR write.
