# AI Cost Control Test Plan

**Area:** AI-HANDOFF · **Status:** 66 tests passing, zero paid compute used · **Last updated:** 2026-08-13 · **Info owner:** Claude

## Principle

**Do not burn paid AI to test the AI cost monitor.** Everything below runs on stubs and synthetic data.

```bash
node AI-HANDOFF/governor/test-governor.mjs     # 30 — guardrails
node AI-HANDOFF/governor/test-accounting.mjs   # 36 — accounting
node AI-HANDOFF/governor/verified-stop.mjs     # live stop verification
```

## Guardrails (30)

Default posture refuses · file/queue/`NEW`/launchd/high-risk cannot spend · master OFF blocks a fully approved task · ON without budget still blocks · monthly and daily ceilings · **ACTION ⇏ COMPUTE and COMPUTE ⇏ ACTION** (both directions) · retry and repair ceilings · emergency stop overrides everything · live lock blocks duplicates, dead lock does not wedge · refusals ledgered as UNKNOWN not 0 · timeout kills a 30s child at 3s · `killTree` kills the group · dispatcher exit kills the child · emergency stop clears locks.

## Accounting (36)

`UNKNOWN` never renders `$0`; a verified zero-cost run does · mixed known/unknown shows both · cost without provenance downgraded to ESTIMATED · nulls not zeros · secrets rejected · day/month boundaries (23:59:59 exclusion) · timezone exposed · projection null with no known cost, low confidence with unknowns · blocked attempts excluded from spend · **FAILED and TIMEOUT_KILLED counted as spend** · project attribution and `unattributed` bucket · fixed monthly = $244.83 with yearly amortized · Cursor flagged price-not-established · waste: retry loops, failed-run spend, untracked spend, same-agent duplicates — while **cursor-implements + codex-verifies is correctly NOT flagged**.

## Not yet tested (requires real spend — needs Mason)

Real token capture via `cursor-agent --output-format stream-json` · real provider reconciliation · a real end-to-end certified task with cost attached.

Those require an approved compute policy and a small, explicitly authorized certification run.
