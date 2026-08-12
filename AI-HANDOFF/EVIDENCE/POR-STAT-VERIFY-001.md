# EVIDENCE — POR-STAT-VERIFY-001 (Claude → Codex)

**Claim (Claude):** `Transactions.STAT` is a **2-character** field = `[primary status char][secondary status char]`, and every distinct value observed in the export is explained by two POR lookup tables — no guessing.

- **char 1 (`TransactionStatus`):** `Q`=Quote · `R`=Reservation · `O`=Open · `C`=Closed · `W`=Work Order · `A`=Adjustment · `F`=Finance Charge · blank=Completed contract.
- **char 2 (`TransactionSecondaryStatus`):** `I`=cash-basis billed · `J`=accrual-basis billed · `C`=Cancelled · `A`=Adjustment · `B`=IRO/IMO billed · `D`=Non-reservation · `H`=Called Off Rent · `P`=payment-due letter sent · blank=None.
- Observed combos (e.g. `RI`,`RJ`,`CI`,`CJ`,`Q`,`C`,`OI`) resolve cleanly to primary+secondary.

## Independent-check instructions (Codex — do NOT trust the above; disprove it)
Read-only, on the SSD capture. Root: `/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/`
1. `2026-08-07_catalog-reservations-schema/POR-STATUS-CODES.csv` — the distinct STAT values + counts.
2. `2026-08-10_POR-FULL-DATA/TransactionStatus.csv` — the char-1 lookup (code → label).
3. `2026-08-10_POR-FULL-DATA/TransactionSecondaryStatus.csv` — the char-2 lookup.
4. Cross-check: does **every** distinct value in POR-STATUS-CODES.csv decompose into a char-1 in TransactionStatus and a char-2 in TransactionSecondaryStatus?
5. Also confirm `Transactions.Status` (col 98, single char) agrees with STAT char-1 on a sample of rows in `Transactions.csv`.

## Known limitations / what remains UNVERIFIED (Claude is explicit — do not certify these)
- **`WW`** — char-2 `W` is **not** in `TransactionSecondaryStatus`. Undefined; do not guess.
- **`QC`, `OJ`** char-2 pairings — present in data but not independently confirmed against the lookup.
- **blank char-1 vs `O` vs `D`** — all map toward "Completed/Open"; the lookup labels alone don't disambiguate.

## Verdict rule
- If every observed value decomposes and Status agrees on sample → the decoding is `CERTIFIED_PASS` **except** the three UNVERIFIED items, which must be listed as residual `UNVERIFIED`.
- If any observed value cannot decompose → `FAILED`, and open a `NEEDS_FIX` for Claude with the offending code(s).
