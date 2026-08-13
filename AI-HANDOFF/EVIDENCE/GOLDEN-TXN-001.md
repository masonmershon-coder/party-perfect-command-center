# GOLDEN-TXN-001 — evidence

**Date:** 2026-08-13 · **Owner:** Claude · **Verifier:** Codex
**Status:** BLOCKED (owner-only) — prepared to the authentication boundary
**Mission:** shared control plane P0 issue #1 · **Approach:** Branch B (supervised POR Counter GUI)

## Result

| Success condition | Result |
|---|---|
| Command Center origin record | NOT STARTED — blocked upstream |
| POR write | **BLOCKED — owner-only** |
| Real POR transaction | **NONE CREATED** |
| Field parity | N/A |
| POR reopen | N/A |
| Fresh replication | N/A — `Replicate-PorToShare.ps1` has still never run |
| Native Crystal print | N/A |
| Assigned showroom printer | **NOT IN POR** — see finding below |
| Codex verification | N/A for the transaction; ran on `GH-BRIDGE-001` |

**POR TEST TRANSACTION NUMBER: NONE CREATED.**

## Exact blockers (both owner-only)

1. **No RDP client on this Mac.** `/Applications` contains no Microsoft Remote Desktop / Windows App. Installing software requires Mason's approval, so this was not done.
2. **ENTERPRISE / POR authentication.** Mason signs in personally. Per instruction, credentials were never requested, displayed, recorded, or stored.

Reachability confirmed by TCP connect only: `192.168.0.5:3389` OPEN, `192.168.0.5:9676` OPEN.

## Safety rules honoured

- No SQL `INSERT`/`UPDATE` attempted.
- `NextNumberNew` and all numbering tables untouched.
- The read-only replication bridge was not modified, relaxed, or bypassed.
- No payment captured. No firewall or network change made.
- No Command Center-only record is being presented as a POR transaction.

## Work completed to the boundary

`AI-HANDOFF/golden-transaction/GOLDEN_TRANSACTION_FIELD_LOG.md` — the GUI runbook and field
specification, derived from the full POR export on PARTYPERF
(`15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA/`), not from assumption:

- **14,667 real quotes** identified in `Transactions.csv` (36,006 rows, 120 columns) by `STAT` char 1 = `Q`, taken **without `LTRIM`**.
- All 14,667 carry a `q`-prefixed `CNTR` (`q10000`…), confirming the quote counter is separate from the numeric contract counter.
- Field fill rates across those quotes give the real staff-entered field set (21 header fields ≥20% fill).
- `DAY = 4` on **12,597 of 14,667 quotes (85.9%)** — the 4-day rate period is the showroom default, evidenced rather than asserted.
- Single store `STR = 001` (100%). `TaxCode = 1` on 99.5%.
- `TransactionItems.csv` — 45 columns; line-entry fields identified.

### Finding — POR does not store the showroom printer

`PrinterFile.csv` is **empty (0 rows)**. `ReportPrinting.PrinterName` is blank on 16 of 17
reports; the only populated value is `Brother Printer` on report #9 (*A/R Summary — Account
(Summary)*), which is not a quote form.

The "assigned showroom printer" is therefore a **Windows workstation fact**, chosen in the
Crystal print dialog, not a POR configuration value. It cannot be derived from the database
and is marked `[OBSERVE]` in the runbook. `Brother Printer` is **not** assumed to be the
showroom printer — the data does not support that.

### Finding — three active quote print formats

`ContractFormat.csv` has 21 active formats, of which three are quotes: **14 Quote - Standard**,
15 Quote - Total Only, 16 Quote - Line Item. Which one the showroom hands a customer is floor
practice, not a database fact. Marked `[OBSERVE]`; no silent default to 14.

## Preserved security finding

Sentinel event `69b7daef8d7b` — `EXPOSED_SERVICE_SURFACE`, HIGH, asset `ENTERPRISE 192.168.0.5`
(RDP 3389, WinRM 5985, SMB 445/139, SQL 9676, IIS 80/443, plus an idle IIS default site dated
2017-03-21). **Retained, not acted on.** The scan was from inside the LAN, so internet exposure
is **not determinable** from this evidence. No firewall or network change was made during this
test, per instruction.

## Not authorized by this run

A successful supervised run would authorize nothing autonomous. Duplicate prevention, timeout
behaviour, field validation, and recovery from a partially completed transaction must each be
proven, and Codex must independently review the automation, before any narrowly scoped
autonomous POR UI write is even proposed to Mason. The vendor API remains the permanent
preferred write path.
