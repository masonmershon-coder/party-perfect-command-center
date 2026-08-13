# OWNER-AI-COST-USAGE-001 — Cursor evidence

**Status:** `READY_FOR_VERIFICATION` · **Not deployed** · **0008 HELD**  
**Branch:** `agent/cursor/OWNER-AI-COST-USAGE-001`

## Schema inspection (before implement)

| Artifact | Status |
|---|---|
| `0005_ai_core_ai_usage.sql` | FOUND, live (`ai_core.ai_usage`) |
| `0003` ai_core tasks/audit | FOUND, live |
| Governor accounting ledger | FOUND, pass-through only |
| Competing usage table | NOT created |

## Implementation

Owners → **AI Cost & Usage** + compact owner dashboard card. Server-side `ai_cost` owner-only. USER_REPORTED seed: Supabase $25, Claude $100, ChatGPT $20, Grok $99, Vercel ~$10/yr uncertain, Cursor UNKNOWN (not $0).

Deterministic micros arithmetic. America/Chicago + DST. Included-plan usage excluded from metered. Conflicting idempotency rejected. CSV formula injection neutralized. Collectors cannot read billing APIs.

Ingest contract: `docs/AI_COST_INGEST_CONTRACT.md`  
Verification bundle: `AI-HANDOFF/EVIDENCE/OWNER-AI-COST-USAGE-001_VERIFICATION_BUNDLE.md`

Claude collectors remain Claude-owned. PG after Mason applies 0008 + `AI_COST_USE_PG=1`.
