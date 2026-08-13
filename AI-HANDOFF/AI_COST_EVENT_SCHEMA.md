# AI Cost Event Schema

**Area:** AI-HANDOFF · **Status:** Implemented · **Last updated:** 2026-08-13 · **Info owner:** Claude

> Normalized usage event written to `COMPUTE_LEDGER.jsonl`. Produced by `accounting.makeUsageEvent()`.

## Fields

**Identity** `event_id` (sha1, idempotency key) · `timestamp` · `task_id` · `correlation_id` · `parent_run_id`
**Attribution** `agent` · `provider` · `runtime` · `model` · `project` · `domain`
**Origin** `manual_or_autonomous` · `trigger_source`
**Authorization** `authorization_id` · `authorization_type` · `risk_tier`
**Timing** `start_time` · `end_time` · `duration_seconds`
**Volume** `input_tokens` · `output_tokens` · `cached_tokens` · `total_tokens` · `api_calls`
**Money** `cost_amount` · `currency` · `cost_classification` · `pricing_source` · `pricing_version`
**Outcome** `retry_number` · `status` · `result` · `verification_status`

## Cost classification

| Value | Meaning |
|---|---|
| `ACTUAL` | provider-reported dollars |
| `CALCULATED` | tokens × published price |
| `ESTIMATED` | heuristic; lowest trust |
| `FIXED_SUBSCRIPTION` | recurring, not per-run |
| `UNKNOWN` | measurable in principle, not available |

## Invariants (all tested)

1. **Unset numerics are `null`, never `0`.** A null token count means "not reported" — a different fact from zero tokens.
2. **A cost with no provenance is downgraded to `ESTIMATED`**, never left implying it was verified.
3. **No cost ⇒ `UNKNOWN` classification.**
4. **Secrets are rejected.** An event containing an API-key-shaped string throws.
5. **Idempotent.** Re-recording the same `event_id` is a no-op, so a re-run cannot double-count.
6. **`BLOCKED_*` rows are recorded but never counted as spend.**
7. **`FAILED` and `TIMEOUT_KILLED` ARE counted as spend** — money was burned even though nothing shipped.
