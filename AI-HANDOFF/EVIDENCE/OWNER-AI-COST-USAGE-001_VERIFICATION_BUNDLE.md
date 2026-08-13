# OWNER-AI-COST-USAGE-001 verification bundle

**Codex:** `READY_FOR_VERIFICATION`  
**Deploy:** NOT AUTHORIZED  
**Migration 0008:** NOT APPLIED  
**Collector credentials:** NOT PROVISIONED

## Provenance

- Repo: `/Users/mikeai/grok-dashboard`
- Branch: `agent/cursor/OWNER-AI-COST-USAGE-001`
- Base commit before this work: `7772b1e` (Talk-to-Mike intake)
- Isolated branch; unrelated dirty AI-HANDOFF/golden-transaction files not staged

## Schema found before implement

- `supabase/migrations/0005_ai_core_ai_usage.sql` — live `ai_core.ai_usage` (Claude PP-009: applied)
- `supabase/migrations/0003_ai_core.sql` — tasks, audit_log, artifacts
- Governor ledger: `AI-HANDOFF/governor/accounting.mjs` + `COMPUTE_LEDGER.jsonl` (pass-through only)
- **Reused 0005.** Additive `0008_ai_cost_control.sql` extends usage + catalogs. No second usage ledger.

## Routes

Owner (`requireApiAuth("ai_cost")`, Matter `payment` read, private/no-store):

- `GET /api/ai-cost/summary|providers|agents|tasks|subscriptions|budgets|alerts|export`
- `POST /api/ai-cost/subscriptions` · `PUT /api/ai-cost/budgets` · `PATCH /api/ai-cost/alerts`

Collector (hashed Bearer `AI_COST_INGEST_TOKEN_SHA256` only):

- `POST /api/ai-cost/ingest`

Contract: `docs/AI_COST_INGEST_CONTRACT.md`

## Tests

```
npm run test:ai-cost
npm run test:api-auth
npx tsc --noEmit
```

Covers owner/unauth/collector isolation, idempotency + conflict, decimal micros, Chicago+DST, proration, included≠metered, stale≠$0, domain split, alerts, rate limit, oversized, CSV injection, secret scan.

## Not live until

1. Real collectors connected (Claude)
2. Codex `CERTIFIED_PASS`
3. Mason deploy approval
4. 0008 applied through approved process
5. Production page verified
6. Sample reconciled to provider billing
