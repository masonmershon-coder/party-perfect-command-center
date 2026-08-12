# Claude Review Findings — partyperfect.app + jobs + Supabase + bots (2026-08-11) → PP-003

Two read-only review passes over `claude/showroom-quote-desk`. Ranked; each has an owner.
**Fix the 🔴 before calling it 100% live** — they undermine the owner-only financial gate or scale.

## 🔴 Must-fix before live
1. **Shared chat transcript leaks owner financials to employees** — `app/api/agents/[id]/chat/route.ts` + `lib/storage.ts`.
   Conversations keyed by **agent id only** → one shared thread. Owner asks AR/balances → answer persists → an
   employee opening Mike sees it (and it's re-fed to Grok). Defeats OWNER_PIN. **Fix:** scope transcripts by role/session,
   or strip financial turns for non-owner reads. **Owner: Cursor.**
2. **`SESSION_SECRET` not required in prod** — `lib/server-auth.ts:31-37`. Falls back to `pp-dev-only:${AUTH_PASSWORD}`
   if unset → forge an `{role:owner}` cookie. **Fix:** `throw` in prod when missing/short (like AUTH_PASSWORD/OWNER_PIN). **Owner: Cursor.**
3. **Owner PIN brute-forceable** — `lib/server-auth.ts:191-212`. 4-digit + in-memory per-lambda throttle that resets on
   cold start. **Fix:** move throttle to Upstash (already a dep), key by IP+action, ≥6-digit PIN. **Owner: Cursor.**
4. **RLS + column grants are inert on the app path** — `0002_por_rls.sql` + `lib/por-db.ts`. The `pg.Pool` uses the
   privileged `DATABASE_URL` role and never sets `app.role`/JWT, so RLS/`is_owner()` never evaluates → financial
   protection rests entirely on the `includeFinancials` app flag. **Fix:** `SET LOCAL app.role=…` per-transaction (pgBouncer-safe)
   + `FORCE ROW LEVEL SECURITY`, OR document app-layer-only + add a truly-restricted DB role. **Owner: Claude (schema/query) + Cursor.**
5. **Serverless connection exhaustion** — `lib/por-db.ts`, `app/api/por/sync/postgres/route.ts`. Pool-per-lambda, no
   `globalThis` cache; `.env.example` recommends **Session** pooler (wrong for serverless). **Fix:** use **Transaction pooler
   (port 6543)** for `DATABASE_URL`, cache pool on `globalThis`, keep `max` 2–3. Bulk ingest stays on direct/session. **Owner: Cursor + Claude.**

## 🟠 Medium
6. **Row-by-row ingest/sync** (1 round-trip/row; 100k–500k for line items) → slow bootstrap + sync timeout. **Fix:** multi-row
   `INSERT … VALUES (…),(…) ON CONFLICT` (500–1000/stmt) or `COPY`. **Owner: Claude.**
7. **Customer search index unused** — `customers_name_idx` is tsvector GIN but query is `ILIKE '%term%'` → seq scans.
   **Fix:** `pg_trgm` GIN indexes. **Owner: Claude.**
8. **Raw DB error text returned to client** — customer-history / square-link / sync routes. **Fix:** log server-side, return generic. **Owner: Cursor.**
9. **All applicant PII + roster injected into Mike every turn, uncapped** — `lib/grok.ts:159`, `lib/candidate-social.ts`.
   Cost/context bloat + over-sharing PII to xAI. **Fix:** cap quick-index (~top 40), load detail on-demand via tool, enable prompt caching. **Owner: Cursor + Claude.**
10. **Greedy `\b\d{6}\b` fires spurious POR lookups / wrong contract** — `lib/por-crm/tools.ts:371`. **Fix:** require an explicit cue. **Owner: Claude.**
11. **Chat model hardcoded `grok-4.3`, no fallback** — chat 502s on a bad model id (jobs path degrades, chat doesn't). **Fix:** one env-backed constant + fallback. **Owner: Cursor.**

## 🟡 Low / nice-to-have
- SSL inconsistent (`rejectUnauthorized:false` on sync pool vs none on query pool) → standardize.  **Owner: Claude/Cursor.**
- `getCustomerHistory` runs 3–4 queries serially → `Promise.all`. **Owner: Claude.**
- Deposit-link has no amount ceiling / rate limit → add cap + limit. **Owner: Claude.**
- `por-db` returns PII with no internal gate → add `includePii` flag (default off). **Owner: Claude.**
- Inbound SMS treats authorized senders as owners → assert managers are owners. **Owner: Cursor.**
- Jobs page = 1,179-line client bundle on paid traffic → code-split enrich sections. **Owner: Cursor.**
- `status_desc`/`created_date` declared but never populated → wire or drop. **Owner: Claude.**

## ⚡ Optimization tricks (worth doing)
- **xAI prompt caching:** split the stable playbook/company block from the dynamic tail (inbox/apps/POR snapshot) → big Mike token cut.
- **On-demand applicant/POR detail** via tools instead of front-loading everything each turn.
- **Transaction pooler + globalThis pool cache**, **pg_trgm** search, **batched inserts/COPY**.
- Cheaper-model routing for simple Madison/health-probe calls. Confirm `.next/` + `tmp/` are gitignored.

## ✅ Genuinely well-built (keep)
POR read-only enforced (ApplicationIntent=ReadOnly, named-instance blocked) · card data excluded at every layer ·
no secrets committed · `sanitize.ts` strips card/gov-ID + nulls money when locked · server-derived financial access
(ignores client flag) · Postgres-preferred/Redis-fallback correct · jobs spam defenses (honeypot, Upstash limits, dup
detection, score withheld from applicant) · `timingSafeEqual` + HMAC httpOnly cookies · resilient streaming persist.
