# Golden Transaction — POR Counter GUI field log & runbook

**Task:** `GOLDEN-TXN-001` · **Mission:** shared control plane P0 issue #1
**Approach:** Branch B — supervised POR Counter GUI, exactly as a showroom employee works
**Date:** 2026-08-13 · **Status:** PREPARED — waiting on owner authentication
**Owner:** Claude (POR) · **Verifier:** Codex

> **This document is the specification for a future POR UI-automation adapter.**
> Every field below was derived from **real POR data**, not from assumption. Where a
> value could not be derived, it is marked `[OBSERVE]` and must be captured live during
> the supervised run. `[OBSERVE]` is never to be filled in from memory or inference.

---

## Evidence base

Derived from the full POR export on PARTYPERF SSD, `15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA/`:

| Source | What it establishes |
|---|---|
| `Transactions.csv` — 36,006 rows, 120 columns | **14,667 real quotes** (`STAT` char 1 = `Q`); field fill rates below |
| `TransactionItems.csv` — 45 columns | line-entry fields |
| `ContractFormat.csv` — 21 formats | the three quote print formats |
| `ReportPrinting.csv` — 17 rows · `PrinterFile.csv` — **0 rows** | printer assignment (see the finding below) |

**Quote numbering, confirmed:** all 14,667 quotes carry a `q`-prefixed `CNTR` (`q10000`, `q10001`, …) drawn from `NextNumberNew`. Contracts use a separate numeric counter. **Nothing in this run may touch `NextNumberNew` directly** — the GUI allocates the number, which is exactly why the GUI is the write path.

---

## Finding: POR does not store the showroom printer

`PrinterFile` is **empty (0 rows)**. `ReportPrinting.PrinterName` is blank on 16 of 17 reports; the single populated value is `Brother Printer` on report #9 (*A/R Summary — Account (Summary)*), which is unrelated to quote printing.

**Therefore the "assigned showroom printer" is a Windows-side fact on the workstation, not a POR configuration value.** It is selected in the Crystal print dialog at print time. It cannot be derived from the database and must be captured as `[OBSERVE]` during the run.

I am not guessing that `Brother Printer` is the showroom printer. It is the A/R report printer, and that is all the data supports.

---

## Quote print format — one decision for Mason or the showroom

Three active quote formats exist. Which one the showroom actually hands a customer is a floor practice, not a database fact:

| # | Description | Report file |
|---|---|---|
| 14 | **Quote - Standard** | `contract-params.SQL.rpt` |
| 15 | Quote - Total Only | `Contract-Params.rpt` |
| 16 | Quote - Line Item | `Contract-Params.rpt` |

`[OBSERVE]` — confirm which format the showroom uses. Do not default to 14 silently.

---

## The synthetic test customer

Exactly **one**, clearly identifiable, no real PII:

| Field | Value |
|---|---|
| Name | `PARTY PERFECT SYSTEM TEST — 2026-08-13` |
| Contact | `SYSTEM TEST` |
| Phone | `[OBSERVE]` — a non-routable placeholder POR will accept; do not use a real number |
| Address | `8401 E 41st St, Tulsa OK 74145` (own showroom — never a real customer address) |
| `TaxCode` | `1` (99.5% of real quotes; Tulsa) |
| `STR` | `001` (the only store in the data) |

**Do not capture payment.** `PAID`, `DEPP`, `DEPR` stay at zero. **Do not delete the transaction afterward** — it is the evidence.

---

## Field log — fill this in live

Columns: what POR calls it · where it comes from · what real quotes show · what was actually done.

### A · Header (Transactions)

| # | POR field | Source | Real-quote fill | Entered value | Notes |
|---|---|---|---|---|---|
| 1 | `CNTR` | **system** | 100% (`q`-prefix) | `[OBSERVE]` | the quote number POR allocates — record it exactly |
| 2 | `CUSN` | staff — customer lookup/create | 100% | `[OBSERVE]` | record whether POR **created** or **matched** the test customer |
| 3 | `STAT` | system | 100% | `[OBSERVE]` | expect char 1 = `Q`; record char 2 verbatim, **never trimmed** |
| 4 | `STR` | default | 100% = `001` | `001` | |
| 5 | `TaxCode` | default/staff | 99.5% = `1` | `[OBSERVE]` | |
| 6 | `DAY` | staff — rate period | **85.9% = `4`** | `[OBSERVE]` | the 4-day showroom default; confirm it is auto or typed |
| 7 | `DATE` / `TIME` | system | 100% | `[OBSERVE]` | |
| 8 | `OPID` / `OperatorCreated` | system — logged-in user | 100% | `[OBSERVE]` | |
| 9 | `Salesman` | staff picker | 99.9% | `[OBSERVE]` | |
| 10 | `OrderedBy` | staff | 99.9% | `[OBSERVE]` | |
| 11 | `DeliveryDate` | staff | 100% | `[OBSERVE]` | record date **and** time |
| 12 | `PickupDate` | staff | 100% | `[OBSERVE]` | |
| 13 | `EventEndDate` | staff | 100% | `[OBSERVE]` | |
| 14 | `Delvr` / `Pickup` | staff | 53.7% / 53.5% | `[OBSERVE]` | delivery vs customer pickup |
| 15 | `PickupSameAddress` | staff | 99.7% | `[OBSERVE]` | |
| 16 | `DeliveryAddress` / `City` / `Zip` | staff | 62.2 / 62.5 / 61.4% | showroom address | |
| 17 | `DeliverToCompany` | staff | 54.3% | `[OBSERVE]` | |
| 18 | `JobSite` / `JOBN` | staff | 50.6% / 100% | `[OBSERVE]` | |
| 19 | `Contact` / `ContactPhone` | staff | 36.9% / 49.6% | `SYSTEM TEST` | |
| 20 | `DeliveryCrewCount` / `PickupCrewCount` | staff | 100% | `[OBSERVE]` | |
| 21 | `CMDT` | staff/system | 100% | `[OBSERVE]` | |

### B · The seven notes fields — keep them distinct

POR carries seven separate note meanings. **Type a unique marker into each one** so replication and print can be checked field-by-field rather than as one blob.

| POR field | Real-quote fill | Marker to type |
|---|---|---|
| `Transactions.Notes` | 69.9% | `GT-NOTES` |
| `Transactions.DeliveryNotes` | 55.1% | `GT-DELIVERY-NOTES` |
| `Transactions.PickupNotes` | 50.0% | `GT-PICKUP-NOTES` |
| `TransactionItems.Comments` | — | `GT-LINE-COMMENT` |
| `TransactionItems.Desc` | — | `[OBSERVE]` |
| Customer job site | — | `GT-JOBSITE` |
| Customer comments | — | `GT-CUSTOMER-COMMENT` |

If any marker is missing, merged, or truncated downstream, that is a **parity defect**, and it is the whole reason for typing seven different strings.

### C · Lines (TransactionItems)

Use **real catalog items at real POR rates**. Invent nothing.

| # | Field | Entered value | Notes |
|---|---|---|---|
| 1 | `ITEM` | `[OBSERVE]` | at least one plain rental item |
| 2 | `ITEM` (kit) | `[OBSERVE]` | **include one `TYPE='K'` kit** — kit expansion is a known parity risk; record whether POR expands components on screen, on save, or on print |
| 3 | `QTY` | `[OBSERVE]` | |
| 4 | `PRIC` / `BaseRate` / `DailyAmount` | `[OBSERVE]` | POR-supplied — **do not override** |
| 5 | `DmgWvr` | `[OBSERVE]` | confirm the waiver computes on **RENT only** (11,567 exact matches in history) |
| 6 | `Comments` | `GT-LINE-COMMENT` | |

### D · Totals — read, never type

`RENT` · `SALE` · `DMG` · `OTHR` · `TAX` · `TOTL` · `DesiredDeposit`

`[OBSERVE]` each. **Record POR's computed values verbatim.** These are the numbers Command Center parity is measured against; a Command Center figure that disagrees is a Command Center defect, not a POR one.

---

## Run sequence — with the stop point marked

| Step | Action | Gate |
|---|---|---|
| 0 | Reach ENTERPRISE | **BLOCKED — owner only.** No RDP client on this Mac; installing one needs Mason's approval. Port 3389 is open. |
| 1 | Authenticate to ENTERPRISE / POR | **STOP. Mason signs in personally.** Claude never requests, displays, records, or stores the credential. |
| 2 | Open Command Center, capture the source request | screenshot |
| 3 | Create the synthetic customer in POR Counter | record created-vs-matched |
| 4 | Enter the quote — sections A, B, C above | fill every `[OBSERVE]` **as it happens**, not from memory |
| 5 | Save | record the allocated `CNTR` |
| 6 | **Close POR. Reopen the quote fresh.** | independent read-back — proves persistence, not screen state |
| 7 | Run a fresh replication to SSD / Command Center | the transaction must appear in a new batch |
| 8 | Native Crystal print, format `[OBSERVE]` | not a Command Center PDF |
| 9 | Send to the showroom printer | `[OBSERVE]` the printer name from the Windows dialog |
| 10 | Hand to Codex for independent verification | Claude must not certify its own run |

---

## Safety rules in force

- GUI only. **No SQL INSERT/UPDATE**, no direct `NextNumberNew` edit, under any circumstance.
- The read-only bridge stays read-only. It is not touched, relaxed, or bypassed.
- No payment captured. No firewall or network change during this test.
- The transaction is **not deleted** afterward.
- One transaction only. If a step fails, **stop and record the partial state** — do not retry into a second quote and leave an orphan.

## Not authorized by this run

A single successful supervised run authorizes **nothing autonomous**. Before any narrowly scoped autonomous POR UI write is even proposed, all four must hold:

1. one supervised Golden Transaction complete;
2. Codex independently reviews the automation behaviour and safeguards;
3. duplicate prevention, timeout behaviour, field validation, and recovery from a **partially completed** transaction are each proven — not argued;
4. Mason receives a recommendation and decides.

**The vendor API remains the permanent preferred write path.** UI automation is a bridge, not a destination.
