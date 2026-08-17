# Mike live-routing P0 — status, root cause, and handoff

**From:** Claude (bridge/local-systems session) · **Date:** 2026-08-14 · **Task:** `MIKE-BRIDGE-WIRE-001`

## UPDATE (2026-08-14): read-only live-answer path SOLVED and verified

The P0 blocker is resolved **additively** — without editing the other agent's files. New module
`mike-brain/live-answer.mjs` (branch `claude/mike-live-answer-001`, SHA `dad53e0`) reuses `tools.mjs`'s
stale-data gate and supplies the one missing piece: a live fetch via authenticated `GET /api/por/sync`
(team-password session from Keychain; secret never logged/committed).

**Verified against LIVE data just now:**
- *"how many delivery tickets did we have out today?"* → **"Deliveries out today: 7. Source: live POR via
  Command Center, synced 10 min ago."** (real `ops.deliveriesToday=7`)
- returns due today → **0**; open contracts → **20**.
- Stale/unavailable data → honest refusal, **never** a number. Non-data question → falls through to the
  task path. Unauthenticated sender → answered nothing. (7/7 hermetic tests + the other agent's 24 tests green.)

**Remaining to reach Mason's real-device PASS (owner/other-agent steps, not code blockers):**
1. Merge `claude/mike-live-answer-001` into the deploy branch (one additive file + tests).
2. Apply the bridge wiring (`mike-bridge-wiring/bridge-wiring.mjs`) and **arm** it — Mason's call.
3. Real-device smoke test: Mason (and Josh) text the question and confirm the reply.
4. (Hardening, optional) replace the team-password session with a scoped Mike read-only token
   (`/api/mike/por-ops` + `MIKE_POR_TOKEN_SHA256`, mirroring `/api/time/mike`) — a Cursor handoff.
5. (Other agent) the *task path* still approval-gates read-only POR questions at the domain level
   (`route.mjs:37`); the live-answer fast path sidesteps it, but it should still be fixed to action-level.

---

### Original diagnosis (2026-08-13) — retained for the record

The live data path is healthy; the transport→Matter seam is built; the last-mile *answer* was blocked by
three defects in the actively-developed `AI-HANDOFF/mike-brain`. I did not edit those files (avoiding
collision, per Mason). The additive `live-answer.mjs` above resolves the answer path around them.

## What I verified WORKS (read-only)

- **Live POR/Redis path is up and fresh.** `GET https://partyperfect.app/api/health` →
  `porSyncConfigured:true`, `porSnapshotPresent:true`, `porSnapshotFreshness:"fresh"`, synced ~11 min ago.
  So `ENTERPRISE POR → sync agent → Redis → Command Center` is serving. The SSD is **not** needed for this.
- **Transport is healthy** and the `mike-brain` stack loads: `routeMessage()` authenticates, classifies,
  and issues a durable Matter task create (verified with mocked exec/send — no real task, no transmit).
- **The stale-data rule is correctly designed** in `tools.mjs` (no SSD path exists in the file at all).

## The P0 blockers (all in `AI-HANDOFF/mike-brain`, verified present in HEAD `262d409`)

1. **Read-only POR questions are wrongly approval-gated.**
   `route.mjs:37` `APPROVAL_REQUIRED_DOMAINS = new Set(["por"])` gates the approval at the **domain**
   level. `intent.mjs` classifies *"how many delivery tickets out today?"* as domain `por`, so a pure
   read gets `approval_required:true` → Mason receives *"Approval required for MIKE-…"* instead of an
   answer. **Fix:** gate approval on the **action** (write/consequential), not the domain. A read-only
   query (`intent.readOnly === true`) must never require approval.

2. **`route.mjs` never calls the answer pipeline.** It creates a Matter task and acknowledges, then
   stops — nothing imports or calls `tools.mjs`. There is no executor that turns an accepted read-only
   task into a live answer via `answerFor()`/`formatAnswer()`. **Fix:** for a read-only live-data intent,
   fetch the snapshot and answer inline (fast path), then `reportResult`.

3. **`tools.mjs` fetches the wrong endpoint for the counts.** `fetchLiveSnapshot()` reads `/api/health`,
   which carries only freshness metadata — **it has no `ops` section** (verified: `"ops" in health === false`).
   But `answerFor()` needs `snapshot.ops.deliveriesToday`. The real counts live in the POR snapshot
   (`lib/por-snapshot.ts` `getPorSnapshot()` / key `por-snapshot.json`; the dashboard renders
   `por.deliveriesToday`). **Fix (a decision is required):** either
   - **(A, mike-brain only)** have the Mac-side Mike read the same Redis `por-snapshot.json` directly
     (needs the Redis connection on the Mac), or
   - **(B, needs Cursor)** add a small **authenticated** Command Center endpoint (or an `ops` block on an
     existing authenticated route) exposing `{deliveriesToday, returnsDueToday, openContracts, syncedAt}`
     for Mike to fetch. `/api/health` is public and must stay metadata-only — do **not** put ops counts there.

Until #1–#3 are fixed, the P0 acceptance case ("text a question → live number") cannot pass. Per Mason's
rule, I am **not** reporting it as passed.

## The bridge wiring (built, verified, NOT armed)

The one piece that is cleanly mine (the **Matter** repo, separate from the mike-brain work) is the
transport→Matter seam. It's ready as a drop-in module (`AI-HANDOFF/mike-bridge-wiring/bridge-wiring.mjs`,
with 3-line insertion instructions at the bottom of that file) that, inside `pollOnce()`, routes each
authenticated inbound message through `mike-brain/route.mjs::routeMessage` before the old `mikeReply`,
defensively (lazy import; a load error falls through unchanged). It REUSES the committed route — no reimplementation.

**It is intentionally NOT applied and NOT armed** because wiring it to today's downstream would make
Mason's acceptance question return *"Approval required"*. Apply it **after** #1–#3 land. The running
bridge process was not restarted.

## Acceptance test — honest result

- Wording tested (code path, mocked send): *"how many delivery tickets did we have out today?"*
- Inbound → authenticate → classify → **Matter task create**: **PASS** (durable task issued).
- **Live number answer → BLOCKED** by defects #1–#3 above. With the current code Mason would get an
  approval-required message, not `deliveriesToday`.
- No real-device test run (would require arming + Mason/Josh sending real texts — that gate is theirs).

## Ownership / routing

- Defects **#1, #2** and **#3(A)** → the `mike-brain` author (control-plane task below).
- Defect **#3(B)**, if chosen → **Cursor** (Command Center endpoint) — see the Cursor handoff section below.
- SSD replication (`POR-REPL-ENTERPRISE-001`): **not touched this turn** — correctly deprioritized behind
  the P0, which is not yet verified. It is not on the live-answer path.
