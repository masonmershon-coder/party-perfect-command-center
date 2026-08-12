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
- **Impact:** Deposit Payment Links cannot be live-tested.
- **Needed:** `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENV`

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
