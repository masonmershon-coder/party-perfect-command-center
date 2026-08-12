# CC-AUTH-P0-001 — Centralized server-side authorization (Cursor task brief)

**Owner:** cursor · **Verifier:** codex · **Do NOT deploy.** Implementation + tests in an isolated branch only.
**Source finding:** `AI-HANDOFF/REVIEW_FINDINGS_2026-08-11.md` (3 🔴 auth/financial-gate holes) + `PP-003` review.

## Objective
Make server-side authorization consistent and centrally enforced across every Command Center API route, remove secret/token fields from responses, and fix sensitive caching — with tests proving it.

## Scope (repo-only; no SSD/ENTERPRISE needed)
1. Read the security finding + `lib/server-auth.ts` (`requireSession`/`requireOwner`) and `lib/ai-core-auth.ts` (`resolveAllowedDomain`).
2. Inspect **every** route under `app/api/**` — list each route, method, and its current auth (session? owner? none?).
3. Identify inconsistencies: routes missing `requireSession`/`requireOwner`, financial/owner-only data returned to non-owner sessions, or domain not server-derived.
4. Implement **centralized** authorization (a single helper/middleware pattern) applied uniformly; financials/PII gated to owner; domain always server-derived (never client-trusted).
5. Remove any secret/token/credential fields from JSON responses.
6. Fix sensitive caching (ensure no-store on authed/financial responses; see `lib/no-store.ts`).
7. Add route/method **authorization tests** (employee vs owner vs unauthenticated → correct 200/401/403; no financial fields leak to employee).
8. `lint` + `typecheck` + `tests` green.

## Evidence to produce (write to AI-HANDOFF/EVIDENCE/CC-AUTH-P0-001.result.md)
- table of every `app/api/**` route → before/after auth
- the centralized helper + where applied
- removed response fields
- caching fixes
- new tests + full output
- draft PR link on branch `agent/cursor/CC-AUTH-P0-001`

## Guardrails
No deploy · no env/secret changes · no migrations · no merge to main. Reference secrets by store name only. Never self-certify — hand to Codex at `READY_FOR_VERIFICATION`.
