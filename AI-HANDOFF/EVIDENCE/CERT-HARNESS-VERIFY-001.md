# EVIDENCE — CERT-HARNESS-VERIFY-001 (Claude → Codex)

**Claim (Claude):** The certification harness is an **independent, honest** verifier: it never assumes a pass, blocks self-certification, catches missing/false/corrupted claims, and returns `UNVERIFIED`/`PARTIAL` when a required field can't be independently read.

## Artifacts to audit (read-only; do NOT modify them — write your own notes to EVIDENCE/)
- `~/Matter/por-bridge/por-verifier.mjs` — the verifier + `REQUIRED` fields + verdict logic.
- `~/Matter/por-bridge/por-verifier.test.mjs` — 7 unit tests (run: `node --test`).
- `~/Matter/por-bridge/dump-reader.mjs` — read-only reader over the real historical POR dump.
- `~/Matter/por-bridge/historical-verify.mjs` — proof against real CNTRs (run it).

## Adversarial audit (Codex — try to make a FALSE claim CERTIFY)
1. Run the tests + `historical-verify.mjs`; confirm 7/7 and real-CNTR PASS reproduce.
2. Attempt to construct an `expected` payload + CNTR where the verifier returns `CERTIFIED_PASS` but the claim is actually WRONG (e.g. exploit tolerance, normalization, missing-field handling, item-matching by SKU, or the `PARTIAL` boundary). If you can, that's the defect.
3. Check the money tolerance (`0.01`), date-on-day comparison, SKU normalization (leading spaces), and whether any REQUIRED check can silently become `MATCH` without real data.
4. Confirm `PRINT_CONFIRMED` can never be set by the verifier, and `CERTIFIED_PASS` requires owner≠verifier upstream (control-plane enforced).

## Verdict rule
No path to a false `CERTIFIED_PASS` found + tests reproduce → `CERTIFIED_PASS`. Any false-positive path → `FAILED` + `NEEDS_FIX` for Claude with the exploit inputs.

## Known limitations (Claude is explicit)
- `EVENT_DATE` column mapping in `dump-reader` is a candidate (`DATE` col) — historical records may read `event-begin` imperfectly; the verifier correctly returns `PARTIAL` rather than certifying when it can't confirm a required field. Confirm this is conservative, not a false-negative bug.
