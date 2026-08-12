# PP-009 — DB UNBLOCK + ARTIFACT IDEMPOTENCY  → **READY_FOR_CURSOR**

**From:** Claude · **Date:** 2026-08-12 · **Repo:** `grok-dashboard`
**Why now:** The whole AI Core is code-complete but **not applied** (blocked on `DATABASE_URL`), and the artifact path will **double-store + double-transcribe = double spend** the moment audio/file intake goes live. Fix both before any intake pipeline runs. Keep it small and surgical.

**Guardrails:** POR read-only. **No production migration without Mason's explicit approval (B-004).** No secrets in git/handoff — refer to env by name only. Do not reorganize storage. Do not ingest the PST. Do not build pgvector or embeddings.

---

## A. Fix + verify DATABASE_URL (B-001)
- Current Vercel `DATABASE_URL` is misconfigured: host `db.<ref>.supabase.co` (**direct — DNS does not resolve**), user `postgres`.
- Correct: **transaction pooler** → `aws-0-us-west-2.pooler.supabase.com:6543`, user `postgres.<ref>` (Supabase → Party Perfect App → **Connect** → **Transaction pooler**).
- **Owner action:** Mason sets the corrected URI in Vercel Production **and** Preview, replies only **"DATABASE_URL is set correctly"** (never the string).
- **Cursor:** once set, run a connectivity probe (existing runtime check) and confirm `connection: ok` before touching schema. Report the probe result.

## B. Apply `0003_ai_core.sql` — GATED
Do **NOT** apply blindly. Order:
1. Confirm connectivity (A) is green.
2. **Inspect live DB state first:** does the `ai_core` schema / any of its tables already exist? Is `0003` partially applied? Report what's actually there before changing anything.
3. **Get Mason's explicit approval** for the production migration (B-004).
4. Only then apply `0003` (via `scripts/apply-0003-ai-core.mjs` / `ai-core:apply-0003`). Confirm all tables + the append-only `audit_log` trigger exist afterward.

## C. Minimum artifact schema patch (`0004`) — smallest thing that unblocks intake
The audio-intake spec (`AUDIO_INTAKE_ENDPOINT_2026-08-12.md`) references artifact columns that `0003` does **not** have. Add only what intake needs:
- `storage_provider` (e.g. `vercel-blob`), `storage_key`, `duration` (seconds, nullable), `mime_type`.
- Keep `sha256`, `bytes`, `kind`, `domain` as-is.
- **Same gate as B:** inspect current `ai_core.artifacts` columns first; write `0004` additively (no destructive changes); apply only with Mason approval.

## D. Enforce idempotency — the anti-double-spend rule
**Principle:** `SAME DOMAIN + SAME CONTENT HASH` → recognize the existing artifact → **reuse the existing (valid) processing result** → **do NOT pay to process it again.**

**Do not blindly add `unique(domain, sha256)`.** First review existing semantics, then pick the correct implementation:
1. **Audit callers** of `ai_core.indexArtifact()` (`lib/ai-core.ts`) — does anything today insert multiple rows with the same content on purpose (e.g. one artifact per task)? If so, a naive unique constraint will **break existing inserts**. Report findings before changing.
2. **NULL-hash behavior:** artifacts without a computed `sha256` (external URL pointers, not-yet-hashed) must NOT collide. Postgres treats NULLs as distinct, but confirm — likely a **partial unique index `(domain, sha256) WHERE sha256 IS NOT NULL`** is the right tool, not a plain constraint.
3. **Upsert, don't throw:** change `indexArtifact()` to **look up `(domain, sha256)` first and return the existing artifact id** if present (or `INSERT … ON CONFLICT … DO NOTHING/UPDATE RETURNING id`), so callers get the existing artifact instead of an error or a duplicate.
4. **Reuse the processing result, not just the row:** transcription/extraction must be keyed to the artifact hash so an already-transcribed artifact is **never re-transcribed**. If a valid result exists for that `(domain, sha256)`, return it; only run the model when there is no valid prior result.
5. **Copy the proven patterns** already in the repo: email `stableId()` sha256 idempotency (`lib/imap-sync.ts`) and POR `ON CONFLICT DO UPDATE` (`app/api/por/sync/postgres`).

**Report back:** whether `unique(domain, sha256)` was sufficient or a partial index / different approach was needed, and why.

---

## Success = ready for safe intake
- [ ] `DATABASE_URL` corrected → connectivity probe green (report result)
- [ ] Live DB state inspected + reported **before** any migration
- [ ] `0003` applied **only after Mason approval**; tables + audit trigger confirmed
- [ ] `0004` adds the 4 intake columns additively (approved)
- [ ] `indexArtifact()` is idempotent on `(domain, sha256)` — same content never double-stored
- [ ] Transcription/processing reuses valid prior results — same content never re-processed (no double spend)
- [ ] Written note on the constraint decision (unique vs partial index vs other)

## Next task after this (do NOT start here)
AI usage/cost logging — smallest shared usage record around every model call, **before** scaling retrieval or bots. Spec: `AI-HANDOFF/AI_USAGE_LOGGING_SHAPE.md`.

## Blockers
**B-001** `DATABASE_URL` (owner) · **B-004** prod migration gated on Mason approval. Both by name only — no secrets in this file.
