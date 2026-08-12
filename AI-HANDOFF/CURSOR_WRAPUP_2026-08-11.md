# CURSOR — Wrap-up: finish Supabase + both websites (2026-08-11)

Everything on Cursor's plate, in priority order. Detail for §2 is in `REVIEW_FINDINGS_2026-08-11.md`.
**No production deploy until Claude review (B-004).** Never put secrets in handoff/git.

## 1. Finish the Supabase go-live (the moment Mason says env is set)
- Apply `supabase/migrations/0001_por_core.sql` then `0002_por_rls.sql` (SQL Editor as `postgres`, or after `DATABASE_URL`).
- `npm i` → `node --env-file=.env.local scripts/ingest-por-supabase.mjs`
- **Verify TRUE record counts** (not line counts): customers **13,823** · contracts **36,006** · line items **317,988** ·
  payments **24,840** · items **9,840** · salesmen **17**.
- Verify RLS + `/api/por/customer-history`: **owner sees `$`, employee does not.**
- Set `READY_FOR_CLAUDE_REVIEW`. Claude reviews gating + counts before any deploy.
- DB uses the **IPv4 shared pooler** (`aws-0-us-west-2.pooler.supabase.com:6543`, user `postgres.<ref>`) in `.env.local` + Vercel.

## 2. partyperfect.app — hardening (PP-003; your items)
**🔴 Fix before prod (they undermine the owner-only financial gate):**
- **Shared chat transcript leaks owner financials to employees** (`app/api/agents/[id]/chat/route.ts`, `lib/storage.ts`) →
  scope transcripts by role/session, or strip financial turns for non-owner reads.
- **`SESSION_SECRET` not required in prod** (`lib/server-auth.ts`) → `throw` if missing/short in production.
- **Owner PIN brute-forceable** (`lib/server-auth.ts`) → move throttle to Upstash (IP+action), require ≥6-digit PIN.

**Then:**
- Mask raw DB errors (customer-history / square-link / sync routes) → return generic, log server-side.
- Centralize the chat model id in one env-backed constant + add a chat fallback (today hardcoded `grok-4.3`, 502s on a bad id).
- Mike prompt bloat: cap the applicant quick-index (~top 40), load applicant/POR detail **on-demand via a tool**, and
  enable **xAI prompt caching** (split the stable playbook block from the dynamic tail) — big token/cost cut.
- Inbound SMS: assert authorized sender phones are owners (or role-gate) before injecting financials.

## 3. partyperfectjobs.com — conversion + Mason's asks
- **KEEP the FULL detailed application** (Mason's decision — see RESOLVED note below). The original ~3-minute form is
  the application. **Do NOT** ship Quick Apply as the default; **revert** it if implemented. Mason needs background
  (experience/work history) to screen who to call.
- **Bump the daily goal 5 → 25** (`lib/hiring-goals.ts`).
- **Code-split** `app/components/jobs/jobs-application.tsx` — dynamic-import heavier sections; keep the core form fields
  in the initial bundle (mobile conversion). Fine as long as the FULL form is the default application.
- **Pay range consistent `$18–$28`** everywhere.

## 4. Guardrails (unchanged)
POR read-only · no card data (Encrypted*/CCAlias/CheckCardFile) · financials owner-only (RLS + app) · PII internal only ·
`Server=ENTERPRISE,9676` only · no secrets in git/handoff · **no prod deploy until Claude review**.

## ✅ RESOLVED — Quick Apply direction (Mason, authoritative, 2026-08-11) = **(b) FULL FORM**
Mason chose **(b): KEEP the full detailed ~3-minute application. NO 60-second Quick Apply.**
Reason: he needs real background (experience/work history) to decide who to call — a bare name/phone
just creates screening work for him + Mike.

**ACTION FOR CURSOR — REVERT PP-004's Quick Apply:** restore the full detailed application form as the
default (undo `applyMode:"quick"` / "Submit Quick Apply"; the full fields are the application, not an
optional after-step). **KEEP** the good parts: daily goal 25, pay $18–$28, and the enrich code-split is
fine *as long as* the full form is what applicants fill out. Net: full form back, everything else stays.
(Earlier "(a)" resolution was from Claude's mistaken PP-004 spec — overridden by Mason.)
