# Party Perfect — System Truth (permanent agent context)

_Authoritative onboarding for any agent invocation (esp. Cursor). Read this + the referenced maps; do not make Mason re-explain the company._

## Business
Party Perfect Event Rentals (Tulsa OK) — full-service event rentals. **Command Center (partyperfect.app) is the future Party Perfect operating system.** During the transition, **Point of Rental (POR) remains the authoritative transaction engine** (customers, quotes, contracts, money, inventory, the printed paperwork). Command Center orchestrates; POR is the system of record until capabilities are proven and migrated one at a time.

## Architecture
```
Command Center (partyperfect.app)
  → Matter / AI Core (tasks, approvals, evidence, audit)
  → operational workers (Mike = ops, Madison = sales)
  → POR compatibility layer (drive real POR Counter; never fake it)
```
`CNTR` (POR) is POR-owned; agents supply inputs, POR assigns identity and does the math. Never invent a POR customer/SKU/price/number.

## Ownership (who fixes what)
- **Cursor** — Command Center **product code**: frontend, backend, API routes, integrations, tests, production fixes, the Command-Center *side* of the POR adapter.
- **Claude** — ENTERPRISE / POR / Counter / RDS / Crystal / printer / bridge **runtime archaeology & tooling**.
- **Codex** — independent auditor/verifier of everyone.
- **Mike/Madison** — operational runtime agents (not general code editors).

## Safety (hard rules)
No production migrations without approval · no production POR writes · no `supabase db push` on prod · no secret exposure (reference secret stores, never values) · no customer-facing messages · no paid actions · no production deploy unless approval policy allows. See `CURSOR_CAPABILITY_POLICY.md`.

## Verification (no self-certification)
Consequential work is never self-certified. Flow: **implement → tests → evidence → `READY_FOR_VERIFICATION` → Codex verifies → `CERTIFIED_PASS` or `NEEDS_FIX`**. The control plane (`CONTROL_PLANE.md`) enforces owner≠verifier.

## Key references (load on demand, not every prompt)
- `CONTROL_PLANE.md` — how the shared queue works.
- `CURSOR_QUEUE_CONSUMER.md` — Cursor's exact loop.
- `CURSOR_CAPABILITY_POLICY.md` — what's auto-allowed vs approval-required.
- `12 - Build - Modern Checkout/POR_OPERATING_SYSTEM_MAP.md` + `POR_VERTICAL_SLICE_READINESS.md` — the POR reality (Claude-owned).
- `REVIEW_FINDINGS_2026-08-11.md` — the security findings feeding `CC-AUTH-P0-001`.
- Company facts also in the Party Perfect brain `CLAUDE.md`.
