# CLAUDE → CURSOR · 2026-08-12 · PP-009 answers from the LIVE database

**Status:** `READY_FOR_CURSOR` · Claude has live pooler access and inspected the real schema.
**TL;DR:** `0003`, `0004`, `0005` are **all applied and verified**. The partial unique index you hypothesised in PP-009 §D.2 **already exists**. `ai_core.artifacts` is **empty (0 rows)**. The only work left in PP-009 is the `indexArtifact()` code change — exact patch below.

---

## Corrections to stale state

Your earlier probe ("`ai_core.*` tables Missing → needs 0003") is superseded. Migrations were applied with Mason's explicit approval, individually, `ON_ERROR_STOP=1 --single-transaction`, no `supabase db push`.

| PP-009 item | Real status |
|---|---|
| §A `DATABASE_URL` / B-001 | **RESOLVED** — transaction pooler, `connection: ok` |
| §B `0003_ai_core.sql` | **APPLIED + VERIFIED** — 8 tables, RLS on all, both `audit_log` append-only triggers present |
| §C `0004` intake columns | **ALREADY APPLIED** — see column list below |
| §D partial unique index | **ALREADY EXISTS** — see index definition below |
| `0005_ai_core_ai_usage.sql` | **APPLIED** — `ai_usage` live |
| `por.*` | **0 schemas, 0 tables — intentionally HELD** |

---

## §C — live `ai_core.artifacts` columns (inspected, not assumed)

All 20 columns:

```
id uuid PK · domain text NOT NULL · kind · location · path_or_url · sha256 · bytes bigint
created_at NOT NULL · related_task uuid · related_meeting uuid
storage_provider · storage_key · mime_type · duration_seconds numeric
updated_at NOT NULL default now()
processing_status text NOT NULL default 'PENDING'
processing_result_ref · processed_at · process_error · retry_count int NOT NULL default 0
```

**Two things to note:**

1. **The column is `duration_seconds` (numeric), not `duration`.** PP-009 §C specifies `duration`. Code written to the spec will break — use `duration_seconds`.
2. The applied `0004` is **broader than PP-009 §C requested**. Beyond your four columns it adds the full processing lifecycle (`processing_status`, `processing_result_ref`, `processed_at`, `process_error`, `retry_count`, `updated_at`). That machinery is what §D.4 ("reuse the processing result, not just the row") needs — it's already there, just unused.

**Constraints:**
```
artifacts_processing_status_chk  CHECK (processing_status IN ('PENDING','PROCESSING','DONE','FAILED'))
artifacts_related_task_domain_fkey     FK (related_task, domain)    -> ai_core.tasks(id, domain)
artifacts_related_meeting_domain_fkey  FK (related_meeting, domain) -> ai_core.meetings(id, domain)
```

---

## §D — answers to your three open questions

### D.1 — "Audit callers; will a unique constraint break existing inserts?"

**No.** `indexArtifact()` in `lib/ai-core.ts:166` is the **only** writer to `ai_core.artifacts` in the repo, and the table currently holds **0 rows** (`with_sha 0, null_sha 0`). Nothing deliberately inserts duplicate content today. There is no back-compat risk.

### D.2 — "NULL-hash behavior; is a partial index the right tool?"

**Your instinct was correct, and it is already deployed.** Live definition:

```sql
CREATE UNIQUE INDEX ux_artifacts_domain_sha256
  ON ai_core.artifacts USING btree (domain, sha256)
  WHERE (sha256 IS NOT NULL);
```

So: rows without a hash never collide, and hashed content is unique per domain. **Do not add another constraint.** A plain `unique(domain, sha256)` would be wrong here and is unnecessary.

There is also a non-unique `artifacts_sha256_idx` on `(domain, sha256)` — redundant alongside the unique index. Harmless; drop it only if you're tidying.

### D.3 — "Upsert, don't throw"

**This is the one real remaining task.** Current code is a plain INSERT and will throw `23505` on repeat content:

```ts
// lib/ai-core.ts:168
`insert into ai_core.artifacts (domain, kind, location, path_or_url, sha256, bytes, related_task, related_meeting)
 values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`
```

Exact patch — infers the **partial** index by repeating its predicate:

```sql
insert into ai_core.artifacts
  (domain, kind, location, path_or_url, sha256, bytes, related_task, related_meeting)
values ($1,$2,$3,$4,$5,$6,$7,$8)
on conflict (domain, sha256) where sha256 is not null
do update set updated_at = now()
returning id, (xmax <> 0) as reused
```

**Why `DO UPDATE` and not `DO NOTHING`:** `DO NOTHING` returns **zero rows** on conflict, so `rows[0].id` throws `TypeError`. `DO UPDATE` always returns the row, so the caller gets the **existing** artifact id — which is the whole point.

`(xmax <> 0) as reused` gives callers a free boolean: `true` = pre-existing artifact, `false` = newly inserted. That is the signal §D.4 needs to decide whether to spend money on processing.

The `where sha256 is not null` clause on `ON CONFLICT` is **required** — Postgres cannot infer a partial index without its predicate.

Suggested signature change: return `Promise<{ id: string; reused: boolean }>`.

### D.4 — "Reuse the processing result, not just the row"

The schema already supports this; no migration needed. Flow:

1. `indexArtifact()` → if `reused === false`, process normally
2. if `reused === true`, read `processing_status`:
   - `DONE` → return `processing_result_ref`, **do not re-process**
   - `FAILED` → re-process if `retry_count` is under budget; increment it
   - `PENDING`/`PROCESSING` → another worker owns it; don't double-start

That is exactly the lifecycle `0004` provisions. Nothing writes these fields yet.

---

## Context you don't have: the Mac worker path

The Talk-to-Mike loop is **live and green** end to end (proven 2026-08-12): iPhone → Mac worker → transcript → extraction → authenticated API → `ai_core.tasks` → `/matter`. 4 tasks, 4 distinct titles, no duplicates.

**Important:** the worker **never calls `indexArtifact()`**. It only POSTs `/api/ai-core/tasks`, so `ai_core.artifacts` stays empty and `ux_artifacts_domain_sha256` never fires. Dedup is currently enforced **worker-side** by a local `task-ledger.json` mapping `sha256 -> taskId` — a stopgap Claude added. Delete that file and duplicates return.

**Two consequences:**
- PP-009 §D fixes the artifact path, which nothing uses yet. Real value arrives with **PP-010** (`POST /api/ai-core/intake`), where the worker writes artifacts instead of jumping straight to tasks.
- `POST /api/ai-core/tasks` still has **no idempotency key** (`createTask()` takes no `sha256`). Your listed `0006 task idempotency` is the durable fix; until then dedup depends on a local JSON file.

**Worker changes Claude made — do not revert:**
- `TEAM_PASSWORD` / `OWNER_PIN` now read from **macOS Keychain at runtime**, Keychain taking precedence over `worker.config.json`
- `worker.config.json` `OWNER_PIN` **cleared** — a stale 4-digit PIN caused `401` on `/api/auth/session`. Password alone → `200` as `employee`, which is all `persona=mike` → `party_perfect` requires. **Side effect:** `persona=matter` (`mershon_personal`) will 403 until a valid owner PIN exists.

---

## Guardrails (unchanged — please re-read before applying anything)

1. **Do NOT apply `0001_por_core.sql` or `0002_por_rls.sql`.** Held by owner decision. They put real customer names, contacts, and payment history into a cloud DB. `por` must stay at 0 tables. Mason's answer to your "yes apply 0001 and 0002" one-liner has **not** been given.
2. **Do NOT run `supabase db push`** — it applies all pending migrations including 0001/0002. Apply individually with `psql -v ON_ERROR_STOP=1 --single-transaction -f <file>`.
3. POR on ENTERPRISE stays SELECT-only.
4. No plaintext secrets in repo, config, or handoff files.

---

## Open question only you can answer

**Which Supabase account created project `wkwksjitkyhaqgrxasml`?**

Mason's interactive Supabase login (username `Kituwa`, ChatGPT/Apple-relay identity) has a Vercel-managed "Party Perfect" org with **zero projects**. Navigating to `/dashboard/project/wkwksjitkyhaqgrxasml` bounces to the org list — no access. `DATABASE_URL` was added to Vercel ~20h ago as Sensitive.

So Mason currently cannot rotate the DB password, manage backups, or grant access.

Please report: **which account/identity was used, and can the project be transferred into Mason's org?** If transfer is awkward, say so plainly — the DB holds one schema and 4 test rows, so recreating under an account Mason controls costs ~15 minutes today and becomes a real migration later.

**Also outstanding:** the Supabase DB password was exposed in a Claude transcript and needs rotating (moot if the project is recreated).

---

## Suggested order

1. **PP-009 §D.3 only** — the `indexArtifact()` upsert patch above. Schema needs nothing; §A/§B/§C are done.
2. Answer the account-ownership question.
3. **PP-010** — worker token + `POST /api/ai-core/intake`, so artifacts actually get written.
4. `0006` task idempotency — retires the `task-ledger.json` stopgap.
5. AI usage logging.

Don't break the green Talk-to-Mike loop while doing any of it.
