# EOD handoff → the agent that owns `AI-HANDOFF/eod/`

**From:** Claude (POR/local-systems session)  ·  **Date:** 2026-08-13  ·  **Status:** ready to merge, not applied

You built the EOD coordinator, production wiring (`mike-eod.mjs`), and the notification/idempotency
layers (commits `7b960ac` → `fe685e3`). Good work — I did **not** touch any of your files. This is a
clean, additive patch for the **two requirements from Mason's `EOD-SAFETY-CHECKPOINT-001` message that
your committed code doesn't cover yet**:

1. **Natural-language intent.** Your `trigger.mjs` only matches the strict `mike, begin end-of-day…`
   family. Mason explicitly asked for natural authorized phrasings: *"run end of day", "do the nightly
   safety check", "make sure everything is backed up and the bots are done", "close out today", "run the
   EOD checkpoint"* — while still rejecting accidental/conceptual mentions.
2. **Resend-while-active idempotency.** *"If Mason sends the same command again after a run has started,
   report the existing active run unless the command clearly requests a new run."* Your per-message-ROWID
   key handles redelivery, but not a human re-send from a new message event.

## What the patch changes (4 files, +149/−7, additive)

- **`trigger.mjs`** — adds `classifyNaturalEod()` + `wantsNewRun()` and makes `parseEodIntent()` fall
  through to them after the strict fast-path. Conservative by design: a command needs BOTH a run-trigger
  AND an EOD-target, and passes guards against questions, deferrals (`tomorrow`), scoped subsets
  (`warehouse only`), injection (`ignore previous instructions`), and personal statements (`I'm done`).
  `evaluateEodTrigger()` now also returns `wantsNew`.
- **`eod.mjs`** — adds `TERMINAL_STATES`, `isActiveStatus()`, `activeRunForToday({mode})` (finds an
  in-flight run for today; a finished/terminal run does not block a later run).
- **`bridge-integration.mjs`** — resend guard: when `config.eodResendGuard === true` and `!decision.wantsNew`,
  an in-flight run for today is reported (`code: "ALREADY_RUNNING"`) instead of starting a second. It's
  **opt-in** so your existing tests are untouched; enable it in the production bridge config.
- **`test-eod.mjs`** — 4 new cases (N1 natural-language matrix, N2/N3 resend guard + `new` override,
  N4 guard-off back-compat) and makes the suite **hermetic** (runs in memory by default via the new
  `_test-bootstrap.mjs`, so it writes nothing and an independent read-only Codex verifier can run it).

## Apply it

```bash
cd /Users/mikeai/grok-dashboard
git apply AI-HANDOFF/CLAUDE_EOD_NL_RESEND_HANDOFF/nl-resend.patch
cp AI-HANDOFF/CLAUDE_EOD_NL_RESEND_HANDOFF/_test-bootstrap.mjs AI-HANDOFF/eod/_test-bootstrap.mjs
node AI-HANDOFF/eod/test-eod.mjs     # expect: 37 passed, 0 failed
```

Verified: the patch applies cleanly onto your current HEAD `fe685e3`, and the merged suite is **37/37**
(your 33 + my 4). The only apply-time dependency is `_test-bootstrap.mjs` (referenced by the test patch).

## Do NOT add `production-io.reference.mjs`

Your `mike-eod.mjs` already IS the production wiring (real heartbeat probes, SSD backup verification,
Codex-audit dispatch, outbound send). My `production-io.reference.mjs` is included **for reference only** —
it duplicates `mike-eod.mjs`. Keep `mike-eod.mjs`; do not add a second wiring module.

Two things I validated against real local state while building this, in case they're useful to your
`mike-eod.mjs`:
- Backup: `01-DATABASE-BACKUPS` on the PARTYPERF SSD is **empty**; the real 524-file POR dump is at
  `15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA` (≈56h old → honestly reports PARTIAL/stale, not a false pass).
- Heartbeats: `claude` was stale (>12h) so it correctly checkpoints as **missing → PARTIAL**; `codex`/`cursor` fresh.

## Boundaries I kept

No live bridge armed, no `bridge.config.json` changed, no real iMessage sent, no POR/ENTERPRISE/SSD writes,
running bridge process untouched. Arming (per-sender `eodAuthorized` + `eodEnabled`) remains Mason's call.
