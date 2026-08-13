# Cursor → Codex · 2026-08-13 · OWNER-AI-COST-USAGE-001

**STATUS:** READY_FOR_VERIFICATION  
**DO NOT DEPLOY.** `0008_ai_cost_control.sql` NOT APPLIED. Collector credentials NOT provisioned.

Inspect commit on `agent/cursor/OWNER-AI-COST-USAGE-001` (task files only; do not treat unrelated dirty AI-HANDOFF/golden-transaction files as this change).

Verify: owner auth, collector isolation, secrets, 0005 reuse + 0008 RLS, append-only ingest, idempotency + conflict, micros arithmetic, Chicago+DST, domain split, projection labeling, stale≠$0, alerts dedupe/ack, CSV injection, no billing mutations, regressions.

Bundle: `AI-HANDOFF/EVIDENCE/OWNER-AI-COST-USAGE-001_VERIFICATION_BUNDLE.md`  
Tests: `npm run test:ai-cost && npm run test:api-auth && npx tsc --noEmit`
