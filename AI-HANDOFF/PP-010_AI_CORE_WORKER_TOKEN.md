# PP-010 — AI_CORE_WORKER_TOKEN + `/api/ai-core/intake`  → **SPEC / READY_FOR_CURSOR (HELD at prod boundary)**

**From:** Claude · **Date:** 2026-08-12 · **Repo:** `grok-dashboard` (+ Mac worker)
**Purpose:** Give the headless local Mike/Matter workers a **dedicated service credential** to create AI Core tasks — instead of impersonating a human web session (`TEAM_PASSWORD`/`AUTH_PASSWORD`/`OWNER_PIN`). Smallest secure contract. **Not** a full identity/IAM system.

**HOLD:** Do **not** deploy, do **not** set the production secret, do **not** apply the migration, do **not** touch POR/Supabase until **B-001** (DATABASE_URL pooler) is resolved and AI Core connectivity is verified read-only. Pure auth logic may be written + unit-tested locally now (see PP-010 tests); it is **not live** until a real `ai_core.tasks` row is created and shown in `/matter`.

---

## 1. Endpoint
`POST /api/ai-core/intake` — a **sibling** of `/api/ai-core/tasks` and `/api/ai-core/approvals`, reserved for **machine/worker** submission (human task API stays session-authed and untouched). `runtime = "nodejs"`.

## 2. Request schema (JSON body)
```jsonc
{
  "idempotencyKey": "2e57ac1ac90f…",   // REQUIRED — the artifact sha256 (content identity)
  "persona":        "mike",             // optional, default "mike". A REQUEST — server governs domain.
  "title":          "Follow up with Williams Construction about the tent quote",  // REQUIRED
  "intent":         "full transcript text…",   // optional
  "type":           "voice",            // optional, default "voice"
  "source":         "ios_voice",        // optional, default "ios_voice"
  "channel":        "shortcut",         // optional (shortcut | matter-ios | …)
  "transcriptRef":  "transcripts/2e57….txt",   // optional reference (not the body)
  "artifact":       { "sha256": "2e57…", "bytes": 250567, "durationSeconds": 15, "file": "1786…-2e57….m4a" },
  "occurredAt":     "2026-08-12T16:04:20.537Z", // optional — preserve original capture time
  "suggestedExecutor": "human"          // optional HINT only; non-privileged
}
```
**Never trusted from the client:** `domain`, `actor`/`createdBy`, `assignedExecutor`, owner/admin flags. If present they are ignored. `persona` is honored only through the server domain mapping below.

## 3. Response schema
| Case | Status | Body |
|---|---|---|
| Created | `200` | `{ "taskId": "...", "domain": "party_perfect", "status": "NEW", "createdBy": "matter-intake-worker", "duplicate": false }` |
| Idempotent replay | `200` | `{ "taskId": "...", "domain": "party_perfect", "status": "...", "createdBy": "matter-intake-worker", "duplicate": true }` |
| Bad/missing token | `401` | `{ "error": "unauthorized" }` |
| Valid token, disallowed domain/scope | `403` | `{ "error": "forbidden" }` |
| Invalid payload | `400` | `{ "error": "<field> required" }` |
| AI Core not connected (DATABASE_URL unset) | `503` | `{ "error": "AI Core not connected" }` |

Responses **must not** leak whether a token is "close", nor list scopes/permissions.

## 4. Token validation flow
1. Extract `Bearer <token>` from `Authorization`. Missing → **401**.
2. Load `AI_CORE_WORKER_TOKEN` (server env only; never `NEXT_PUBLIC_*`). Unset → **401** (+ server-log config warning, no value).
3. **Constant-time compare** (`crypto.timingSafeEqual`, length-guarded). Mismatch → **401**.
4. `resolveWorkerActor(token)` → `WorkerIdentity | null`. Null → **401**.
5. Map `persona → requestedDomain` (server side, reuse `PERSONA_DOMAIN`). If `requestedDomain ∉ identity.allowedDomains` → **403**. If `"CREATE_TASK" ∉ identity.scopes` → **403**.
6. Validate `title` and `idempotencyKey` non-empty → else **400**.
7. `if (!isAiCoreConfigured()) return 503` (so the worker queues + retries).
8. `createTaskIdempotent(...)` → `{ id, duplicate }`.
9. On real create only → `logAudit(...)`.
10. Return 200.

## 5. Server-side actor / domain / scope mapping (v0)
```ts
type WorkerScope = "CREATE_TASK";
interface WorkerIdentity { actorId: string; allowedDomains: string[]; scopes: WorkerScope[]; }

// v0: ONE env token → ONE fixed identity. No token DB.
function resolveWorkerActor(token: string): WorkerIdentity | null {
  const expected = process.env.AI_CORE_WORKER_TOKEN?.trim();
  if (!expected || !constantTimeEqual(token, expected)) return null;
  return { actorId: "matter-intake-worker", allowedDomains: ["party_perfect"], scopes: ["CREATE_TASK"] };
}
```
- Mike voice worker gets exactly: **CREATE `ai_core.tasks`** in **party_perfect**, and READ of the returned id. Nothing else — **no** approvals, brain writes, POR, customer comms, deletion, admin APIs, owner privileges.
- `persona="matter"` → domain `mershon_personal` → **not** in `allowedDomains` → **403** (a future `matter-home-worker` token would grant it — see §Future).

### Future-proof (do NOT build now)
Design `resolveWorkerActor` as the only seam. Later it becomes a small registry — still no IAM:
```
mason-iphone     -> actor=mason-iphone     domains=[mershon_personal]           scopes=[CREATE_TASK]
josh-iphone      -> actor=josh-iphone      domains=[mershon:josh]               scopes=[CREATE_TASK]
mike-worker      -> actor=matter-intake-worker domains=[party_perfect]          scopes=[CREATE_TASK]
matter-home-worker -> actor=matter-home-worker domains=[mershon_personal]       scopes=[CREATE_TASK]
meeting-worker   -> actor=meeting-worker   domains=[party_perfect,mershon_personal] scopes=[CREATE_TASK, CREATE_MEETING]
```
v0 ships **one** env token → one identity. Multiple tokens = later, same interface.

## 6. Attribution (task fields)
- `created_by = identity.actorId` (**"matter-intake-worker"**) — never `"staff"`, never `"mason"`.
- `source = source` (`ios_voice`), `type = type` (`voice`), `title`, `intent`.
- `source_reference = idempotencyKey` (sha256).
- `input_context (jsonb)` preserves: `{ persona, channel, sha256, transcriptRef, occurredAt, bytes, durationSeconds }` (references, not the audio/transcript body).
- `suggested_executor` = the hint if provided; `assigned_executor` stays null (no dispatcher acts on it).

## 7. Idempotency (exactly-once)
- Add `ai_core.tasks.idempotency_key text` + **partial unique index** `(domain, idempotency_key) WHERE idempotency_key IS NOT NULL` (migration §9). Same pattern as the `0004` artifact dedup.
- `createTaskIdempotent`: `INSERT … (idempotency_key) … ON CONFLICT (domain, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`.
  - Row returned → **created** (`duplicate:false`).
  - No row (conflict) → `SELECT id … WHERE domain=$d AND idempotency_key=$k` → **replay** (`duplicate:true`). Never a second row.
- The worker uses `idempotencyKey = artifact sha256`, so the same recording → the same task, even across retries/flushes.
- (Optional, complementary) also record an `ai_core.artifacts` pointer row (0004) `kind='audio', storage_provider='mac-worker', storage_key=<file>, sha256, related_task=<taskId>` — no bytes stored server-side; gives full traceability. Not required for the milestone.

## 8. Queue-flush behavior (worker side)
- Source: the Mac worker's `intake-queue.jsonl` (existing). Each entry has `{queuedAt, persona, title, intent, artifact:{sha256,…}}`.
- `scripts/flush-intake-queue.mjs`: for each entry whose `sha256` is **not** in the delivered ledger, `POST /api/ai-core/intake` with `idempotencyKey=sha256`, `occurredAt=queuedAt`, etc.
  - `200` → append `{ sha256, taskId, duplicate, deliveredAt }` to `intake-delivered.jsonl` (append-only ledger).
  - `503`/`5xx`/network → **leave the entry**, retry later. Never delete.
- **Safe to run repeatedly**: endpoint idempotency is the real guarantee; the local ledger is an optimization to skip re-POSTing. Running flush twice yields **one** task per sha.
- **Do not delete** `intake-queue.jsonl` historical records — mark delivered via the ledger only.

## 9. Migration (additive; HELD)
`supabase/migrations/0006_ai_core_task_idempotency.sql`:
```sql
alter table ai_core.tasks add column if not exists idempotency_key text;
create unique index if not exists ux_tasks_domain_idem
  on ai_core.tasks (domain, idempotency_key) where idempotency_key is not null;
```
Additive, non-destructive. **Do not apply** until B-001 + Mason's explicit migration approval. In-scope AI Core migrations only (`0003` required; `0004`,`0005`,`0006` additive) — **never** re-run POR `0001`/`0002`.

## 10. Audit logging
- On **real create**: `logAudit({ domain, actor:"matter-intake-worker", action:"CREATE_TASK", entity_type:"task", entity_id:taskId, detail:{ source, persona, channel, sha256, requestId, transcriptChars } })`. No token, no transcript body, no PII.
- On **idempotent replay**: **no** audit row (no state change; audit_log is append-only and must not inflate on retries).

## Security responses (recap)
401 missing/invalid token · 403 valid token wrong domain/scope · 400 invalid payload · 503 AI Core unavailable · replay → clean 200 `duplicate:true`. Never leak token/permission internals.

## Exact files
**grok-dashboard (Cursor):**
1. NEW `app/api/ai-core/intake/route.ts` — the endpoint (flow §4–§10).
2. NEW `lib/ai-core-worker-auth.ts` — `WorkerIdentity`, `constantTimeEqual`, `resolveWorkerActor`, `workerCanCreate(identity, domain)`. (Pure logic already proven — see PP-010 tests in `lib/foundation-logic.mjs` / `scripts/foundation/foundation.test.mjs`; port it verbatim.)
3. EDIT `lib/ai-core.ts` — add `createTaskIdempotent({...})` (ON CONFLICT), keep `domain` required, call `logAudit` on create.
4. NEW `supabase/migrations/0006_ai_core_task_idempotency.sql` — §9 (HELD).
5. ENV — `AI_CORE_WORKER_TOKEN` in Vercel (Prod+Preview) + local `.env.local` (owner; never committed/logged).

**Mac worker (Claude, after B-001):**
6. EDIT `~/Matter/worker/matter-intake-worker.mjs` — replace `getSession()`/`createAICoreTask()` (session impersonation) with a worker-token `POST /api/ai-core/intake`; `idempotencyKey=sha256`; delivered ledger; queue fallback unchanged.
7. NEW `~/Matter/worker/scripts/flush-intake-queue.mjs` — §8.
8. Docs — update `AI-HANDOFF/AUDIO_INTAKE_ENDPOINT_2026-08-12.md`, `BLOCKERS.md`.

## Tests required
**Offline unit (no DB) — done now in `foundation.test.mjs`:**
- `resolveWorkerActor`: correct token → identity; wrong/empty/malformed → null; constant-time compare used.
- domain governance: `mike → party_perfect` allowed; `matter → mershon_personal` → forbidden for the mike-worker identity.
- idempotency decision: same key → treated as replay (create-once).

**Integration (GATED on B-001):**
- valid token+payload → 200 creates task; `created_by="matter-intake-worker"`, `source="ios_voice"`, `persona`, `sha256` recorded.
- same `idempotencyKey` twice → one row; 2nd returns `duplicate:true` (unique index enforces).
- missing token → 401; `persona=matter` → 403; missing `title`/`idempotencyKey` → 400; DATABASE_URL unset → 503.
- `audit_log` has one CREATE_TASK on create, none on replay.
- RLS: worker path uses service role (server) so writes succeed; an `authenticated` employee session still cannot INSERT.

**Worker flush (GATED):** run flush twice → exactly one task per sha; `intake-delivered.jsonl` ledger written; `intake-queue.jsonl` retained.
