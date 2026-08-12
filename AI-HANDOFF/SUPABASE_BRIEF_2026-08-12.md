# Cursor brief — Supabase state (2026-08-12)

**To:** Claude Code · **From:** Cursor · **Owner:** Mason  
**Repo:** `grok-dashboard` · **Branch:** `claude/showroom-quote-desk`  
**Prod:** https://partyperfect.app · tip still **v1.9.4**  
**Probe:** `GET /api/health?probe=db` @ ~19:23Z

**Ask:** Assist Cursor on the open items below (inspect, coach Mason on SQL Editor if needed, review Cursor’s PP-009 plan). Do **not** invent POR numbers. No secrets in handoff.

---

## 1) What’s done (verified live)

| Item | Evidence |
|------|----------|
| Vercel `DATABASE_URL` = **transaction pooler** | host `aws-0-us-west-2.pooler.supabase.com`, port **6543**, user `postgres.wkwksjitkyhaqgrxasml` |
| **Connection** | `connection: ok` · `expectedPooler: true` · B-001 URI **CLEARED** |
| **`ai_core` schema live** | tables: `projects`, `tasks`, `meetings`, `artifacts`, `approvals`, `brain_records`, `audit_log`, **`ai_usage`** |
| **`0003` applied** | `needsMigration0003: false` · all 7 core tables + `ai_usage` |
| RLS on ai_core | enabled on all listed tables |
| Real writes | **`tasks: 4`**, **`audit_log: 4`**, approvals 0 |
| App helpers | `lib/ai-core.ts` + `/api/ai-core/tasks` + approvals routes exist in codebase |
| Redis POR 2.0 | snapshot still fresh (~6–10 min); **independent** of Postgres `por.*` |

**Not done / still empty:** entire **`por.*`** schema (customers, contracts, items, payments, …) — PP-001 go-live still blocked on migrations + ingest.

**Cursor local gap:** `.env.local` has **no** `DATABASE_URL` → Cursor cannot run apply/inspect scripts against prod without Mason pasting the pooler URI locally (name only in chat) **or** Claude/Mason applying via Supabase SQL Editor.

---

## 2) Two tracks (don’t conflate)

### Track A — Brain / AI Core (Matter + Mike shared memory)
**Status:** schema mostly live; **safe-intake follow-ons open** (PP-009 / PP-010).

### Track B — POR Postgres mirror (Command Center quotes / history)
**Status:** **not started on DB** — Redis snapshot works; Supabase `por.*` missing. Needs `0001` → `0002` → ingest → sync agent.

---

## 3) What we need from Claude (assist Cursor)

1. **Confirm who applied `0003` / `0005`** (SQL Editor vs script) and whether **`0004` artifact columns** are already on live `ai_core.artifacts` (`storage_provider`, `storage_key`, `duration`, `mime_type`, hash unique/partial index). Cursor’s probe does **not** list columns — Claude can coach Mason to run a read-only `\d ai_core.artifacts` / information_schema query in SQL Editor and paste **column names only**.
2. **Review PP-009 D plan** before Cursor codes: `indexArtifact()` is still a plain `INSERT` (`lib/ai-core.ts`) — recommend partial unique `(domain, sha256) WHERE sha256 IS NOT NULL` + lookup/upsert. Audit callers first (spec already says this).
3. **PP-001 POR:** when Mason is ready, hand him the exact SQL Editor order (`0001` then `0002`) + true bootstrap counts (contracts **36,006** not 160k). Cursor will run ingest after `DATABASE_URL` is in `.env.local` **or** after Claude confirms tables exist.
4. **Do not** start PP-010 prod secret / deploy until PP-009 idempotency is green (Claude’s own HOLD in PP-010).
5. **Reply in** `AI-HANDOFF/CLAUDE_TO_CURSOR.md` with: column inspect result, approve/revise PP-009 D approach, and whether Mason should say **yes apply 0004** / **yes apply 0001+0002**.

---

## 4) What we need from Mason (one-liners)

| Say this | Unlocks |
|----------|---------|
| **yes finish PP-009** | Cursor: confirm/apply `0004` if missing + idempotent `indexArtifact` |
| **yes apply 0001 and 0002** | POR Postgres schema (then ingest) |
| Paste pooler URI into **`.env.local`** as `DATABASE_URL` (never into handoff) | Cursor can script-apply / column-inspect without SQL Editor |
| **yes start PP-010** (after 009) | Worker token + `/api/ai-core/intake` |

Still open elsewhere (not this brief): B-002 Square · B-005 OWNER_PIN ≥6 · Twilio `smsReady` · B-004 merge gate.

---

## 5) Recommended next sequence

```
1. Claude: live column inspect of ai_core.artifacts (+ confirm 0004)
2. Mason: "yes finish PP-009"
3. Cursor: apply 0004 if needed → idempotent indexArtifact → CURSOR_TO_CLAUDE report
4. Claude: review → VERIFIED
5. Only then: PP-010 intake token  OR  POR 0001/0002 if Mason prioritizes quotes
```

---

## 6) Key files

| | Path |
|--|------|
| Probe | `lib/supabase-probe.ts` · `GET /api/health?probe=db` |
| AI Core API | `lib/ai-core.ts` · `app/api/ai-core/*` |
| Migrations | `supabase/migrations/0001`…`0005` |
| Specs | `AI-HANDOFF/PP-009_…md` · `PP-010_…md` · `AI_CORE_DATA_CONTRACT.md` |
| POR go-live | `AI-HANDOFF/GO_LIVE.md` · `docs/POR_SYNC.md` |

**No passwords, tokens, or full `DATABASE_URL` in this file.**
