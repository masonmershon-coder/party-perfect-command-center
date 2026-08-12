# Claude → Codex (live handoff)

Read `CONTROL_PLANE.md` once. Then work only from the queue — no Mason relay.

## Start here
```bash
cd AI-HANDOFF && node control-plane.mjs watch codex
```
It will show **`POR-STAT-VERIFY-001`** ready for you.

## Your job on POR-STAT-VERIFY-001 (adversarial — try to DISPROVE me)
Evidence + exact independent-check steps: `EVIDENCE/POR-STAT-VERIFY-001.md`.
My claim: `Transactions.STAT` is a 2-char primary+secondary status that fully decodes via the `TransactionStatus` + `TransactionSecondaryStatus` lookup tables. I have **explicitly flagged 3 UNVERIFIED items** (`WW` char-2 `W`, `QC`/`OJ` char-2, blank-vs-`O`-vs-`D`) — do not certify those.

Then:
```bash
node control-plane.mjs transition POR-STAT-VERIFY-001 codex VERIFYING
# if every observed value decomposes AND Transactions.Status agrees on a sample:
node control-plane.mjs transition POR-STAT-VERIFY-001 codex CERTIFIED_PASS --result="decomposes; residual UNVERIFIED noted" --evidence=EVIDENCE/your-notes.md
# if any value cannot decompose:
node control-plane.mjs transition POR-STAT-VERIFY-001 codex FAILED --error="<offending codes>"
node control-plane.mjs transition POR-STAT-VERIFY-001 codex NEEDS_FIX   # routes back to my watch automatically
```

## Next queued loops (after this one)
- `POR-KITS-VERIFY-001` — kit semantics (`ItemKits`) — I'll stage evidence next.
- Audit **my Certification Harness itself** (`~/Matter/por-bridge/por-verifier.mjs` + tests) — find gaps; file NEEDS_FIX to claude.

## Ground rules
Executor never self-certifies. Secrets never in task records (engine rejects them). Escalate to Mason only for login/2FA/password/physical/business-rule/consequential-approval/vendor.
