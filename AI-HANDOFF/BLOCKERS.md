# BLOCKERS

Open blockers only. No secrets/PII. Update status when cleared.

## B-001 — DATABASE_URL wrong host (not transaction pooler)

- **Status:** CLEARED (URI + connect) — re-probed 2026-08-12 ~18:02Z on partyperfect.app
- **Finding:** Vercel `DATABASE_URL` is now **transaction pooler**:
  - Host **`aws-0-us-west-2.pooler.supabase.com`**, port **6543**, user **`postgres.wkwksjitkyhaqgrxasml`**
  - Runtime: `connection: ok` · `expectedPooler: true`
- **Follow-on (2026-08-12 ~18:46Z):** `ai_core` **is live** (incl. `brain_records`, `ai_usage`, 4 tasks). `por.*` still missing.
- **Needed for POR track:** Mason YES for `0001`+`0002` + ingest. Local `.env.local` still has no `DATABASE_URL` for Cursor apply scripts.
- **Related:** PP-001 / PP-009 brain follow-ons (idempotent artifacts, intake)

## B-002 — Square env not confirmed

- **Status:** OPEN
- **Impact:** Deposit Payment Links cannot be live-tested. **PP Time Shadow Mode cannot read live Labor/Team data** (re-checked 2026-08-17 16:33 CDT after Mason “Preview Square env is set”: Preview pull still MISSING Square names + CRON_SECRET on `party-perfect-command-center`).
- **Needed:** `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENV=production` in **Vercel Preview** (Time) via Vercel UI — Labor/Team **read** only. Do not paste into chat. Same names still needed for payment-links testing (separate scopes; do not reuse a Payments-write token for Time if avoidable).

## B-003 — Claude ↔ Cursor shared chat / auto-wake

- **Status:** PARTIAL — relay shipped (`AI-HANDOFF/RELAY.md`)
- **Related:** coordination

## B-004 — Prod deploy gated on Claude review

- **Status:** OPEN (Mason instruction)
- **Impact:** No merge-to-main / Vercel production cutover until Claude reviews.
- **Needed:** Claude VERIFIED on PP-003/PP-004 (and PP-001 after ingest).

## B-005 — OWNER_PIN must be ≥6 digits in Vercel

- **Status:** OPEN (PP-003)
- **Impact:** Old 4-digit PIN will fail after deploy of PP-003.
- **Needed:** Mason sets a new ≥6-digit `OWNER_PIN` (+ `SESSION_SECRET`) in Vercel before prod.

## Data freshness — read before quoting any POR number

`node AI-HANDOFF/brain-status.mjs`

Sources are graded LIVE / STALE / FROZEN by age. **Never present a FROZEN source's
figures as current** — state the cutoff date or decline. As of 2026-09-30 the
transaction detail is 50 days frozen while the ops snapshot beside it is minutes
old. Fix: `AI-HANDOFF/BRAIN_LIVE_DATA_RUNBOOK.md`
