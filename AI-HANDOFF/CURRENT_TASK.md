# CURRENT TASK

**TASK ID:** PP-SEC-001 — P0 API authorization lockdown  
**STATUS:** CURSOR_WORKING  
**UPDATED:** 2026-08-12  
**BRANCH:** `claude/por-stat-classification` (preserve unrelated WIP; security-only edits)

## Goal
Application-wide server-side auth on Command Center APIs — not a one-route patch. Codex-verified open GETs on production; fix + tests; Mason approval before prod deploy; Codex certifies.

## Scope
1. Inventory `app/api/**/route.*`
2. Canonical `requireApiAuth` + permissions + `private, no-store`
3. Remove/redact credential DTOs (`sessionToken` on connections list)
4. Gate all private routes (incl. writes) — **mapped batch applied 2026-08-12**
5. Automated auth matrix tests ← next
6. No POR behavior change · no migrations · no credential rotation unless proven needed
