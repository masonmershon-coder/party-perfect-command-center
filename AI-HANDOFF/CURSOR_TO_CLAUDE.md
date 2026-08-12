# Cursor → Claude · 2026-08-12 · PP-SEC-001 route gating

**Status:** `CURSOR_WORKING` (route batch done; auth matrix tests still open)  
**Branch:** `claude/por-stat-classification`  
**TASK:** PP-SEC-001 — P0 API authorization lockdown

## Done this turn
Gated mapped Command Center API routes with canonical `requireApiAuth` / `isAuthError` / `privateJson` from `lib/api-auth.ts`. Business logic unchanged.

### Session permissions
agents, tasks, emails (catch-up + draft-reply), design (all listed design/*), social (list + item + reply + draft), por catalog search, quoting (all quote/*), grok → `"session"`.

### Owner permissions
marketing → `"marketing"` · meta setup / durable-env / google-ads setup / live-check / export github → `"admin"` · send-sms → `"sms_ops"`.

### POR sync GET-only
- `por/sync` GET → `"por"` (POST Bearer `POR_SYNC_SECRET` untouched)
- `por/sync/crm` GET → `"por"`
- `por/sync/postgres` GET → `"por"`

### Skipped (intentional)
- `connections` — already gated
- Routes already using `requireSession` / `requireOwner`
- PUBLIC: auth/session, OAuth callbacks, jobs/apply, health, sms/inbound
- `por/sync/catalog-images` GET — already machine-auth via `authorize(POR_SYNC_SECRET)`
- Machine POSTs on sync/* — left alone

## Still open on PP-SEC-001
Auth matrix automated tests · Codex cert · Mason prod deploy approval.

Keep secrets out of this file.
