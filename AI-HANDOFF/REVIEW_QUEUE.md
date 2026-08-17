# REVIEW QUEUE

| Task ID | From | To | Status | Notes |
|---------|------|----|--------|-------|
| PP-HANDOFF-001 | Cursor | Claude | VERIFIED ✅ | Protocol accepted |
| PP-001 (data layer) | Cursor | Claude | VERIFIED ✅ | RLS + ingest + sync/postgres code |
| PP-001 (go-live ingest) | Cursor | Claude | WAITING_FOR_MASON | Needs DATABASE_URL + SQUARE env |
| PP-003 (app hardening) | Cursor | Claude | **READY_FOR_CLAUDE_REVIEW** | RED financial-gate fixes + follow-ons |
| PP-004 (jobs conversion) | Cursor | Claude | SUPERSEDED | Quick Apply rejected by Mason; see REL-V197 |
| REL-V197-RECONCILE-001 | Cursor | Claude | **READY_FOR_CLAUDE_REVIEW** | **LIVE v1.9.7** — full original jobs app + restored CC; attack partyperfect.app + jobs.com |
| HIRING-PIPELINE-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Full apply→store→Hiring→Mike path; synthetic tests; not deployed |
| WEBSITE-CONVERSION-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Rental positioning + empty Get Quote + careers; ASP patches; rate trace; not deployed |
| POR-PARITY-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Waiver RENT-only, TaxCode, notes 1:1, job sites, salesman, STAT no-LTRIM, kits, 4-day hold label; not deployed |
| SENTINEL-APP-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | CC Security Inbox + health card + event APIs + telemetry + injection counts; read-only; not deployed |
| SEC-HEALTH-PII-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Public `/api/health` = `{ok,service,version}` only |
| SEC-HEADERS-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | CSP + XFO + XCTO + referrer + permissions via next.config |
| SEC-GATEWAY-WIRE-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Matter `evaluate()` on `requireApiAuth`; MANAGER denied tier-3 |
| TALK-TO-MIKE-INTAKE-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Remote intake CREATE/COMPLETE/STATUS + private audio queue; 0007 HELD; not deployed |
| OWNER-AI-COST-USAGE-001 | Cursor | Codex | **READY_FOR_VERIFICATION** | Owner AI Cost & Usage CC; reuses 0005; 0008 HELD; ingest contract for Claude collectors; not deployed |
| PP-TIME-001 | Cursor | Mason | **WAITING_FOR_MASON** | Self-contained role-aware `/time` app (Shelly admin in-app); CC mirror only; 0009 HELD; no Square cutover without YES |
| KITUWA-V1 | Cursor | Codex | **READY_FOR_CODEX_REVIEW** | Mason OS at /kituwa; Matter route() reused; kituwa.app not attached; not PP production |
| BRAIN-RECONCILE-001 | Cursor | Codex | **READY_FOR_CODEX_BRAIN_REVERIFY** | Inventory + preserve + manifest v1.0.1 + brain-sync code + Time/Matter bundles + cold-start proof; Drive sync NOT implemented; automatic sync NOT running |
| MATTER-ORCH-V1 | Cursor | Claude | **READY_FOR_CLAUDE_REVIEW** | Provider-neutral orchestration V1: policy/ack/heartbeat/registry/route/report/audit + Matter Control owner view; evidence `MATTER_ORCHESTRATION_V1_AUDIT.md` |
| PP-001 (Quote Desk UI) | Claude | (Claude) | CLAUDE_WORKING | Parallel |
| PP-005 (Mike inventory lookup) | Cursor | Claude | **READY_FOR_CLAUDE_REVIEW** | Tool + prompts + heuristic wired; catalog/reservations (no Supabase) |
| PP-009 (Supabase / AI Core) | Cursor | Claude | **READY_FOR_CLAUDE** | Brief: `SUPABASE_BRIEF_2026-08-12.md` — ai_core live; need 0004 inspect + idempotency assist |
| PP-001 (POR Postgres go-live) | Cursor | Claude | WAITING_FOR_MASON | `por.*` still missing; needs 0001+0002 + ingest |

## SENTINEL — APPROVE WITH CHANGES
**2026-08-13** · Codex adversarial architecture review · verdict relayed by Mason.
Monolithic-agent concept rejected. Sentinel must be five separate components:
collectors · evidence ledger · analyst · containment broker · watchdog.
V1 (`sentinel/sentinel.mjs`) marked SUPERSEDED in-file.
Phase 1 deliverable ready: `sentinel/SENTINEL_PERMISSION_MATRIX.md`.
Review record: `EVIDENCE/SENTINEL_ARCHITECTURE_REVIEW_2026-08-13.md`
⚠️ Codex's full review TEXT is not in evidence — `SENTINEL-ARCH-REVIEW-001` is still NEW with no run output.
