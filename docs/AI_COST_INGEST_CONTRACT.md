# AI Cost ingest contract (Claude collectors)

Task: `OWNER-AI-COST-USAGE-001`  
Auth scope: **collector only**. Cannot read owner billing APIs.  
Do not put real credentials in this file or AI-HANDOFF.

## Endpoint

```
POST /api/ai-cost/ingest
```

Production host (after Mason deploy approval only): `https://partyperfect.app/api/ai-cost/ingest`

## Authentication

```
Authorization: Bearer <plaintext-collector-token>
```

Server compares SHA-256 of the presented token to env **name** `AI_COST_INGEST_TOKEN_SHA256`.  
Provisioning: generate a high-entropy token locally, store only the hex SHA-256 in Vercel/env. Never commit plaintext. Never reuse agent execution keys.

Owner CC cookies cannot ingest. Collector bearer cannot call `/api/ai-cost/summary` (or other owner routes).

## Limits

- Max body: 64 KiB
- Max events per request: 50
- Rate limit: 30 requests / minute / principal
- Cache: private, no-store
- Future timestamps rejected (5 minute skew)
- Payloads containing secret-like strings rejected
- Idempotency: unique key; same key + same immutable fields = duplicate (counted once); same key + different immutable fields = `idempotency_conflict` (rejected, audited)

## Request schema

```json
{
  "collectorId": "claude-mac",
  "error": null,
  "events": [
    {
      "idempotencyKey": "claude:task-abc:attempt-0:call-1",
      "occurredAt": "2026-08-13T16:00:00.000Z",
      "agentId": "claude",
      "taskId": "optional-matter-task-id",
      "correlationId": "same-id-across-retries",
      "causationId": "optional",
      "provider": "anthropic",
      "model": "optional-model-id",
      "operation": "chat",
      "requestCount": 1,
      "inputTokens": 100,
      "outputTokens": 50,
      "cachedTokens": 0,
      "cachedOutputTokens": 0,
      "reasoningTokens": 0,
      "audioSeconds": 0,
      "transcriptionSeconds": 0,
      "imageCount": 0,
      "storageBytes": 0,
      "computeMs": 0,
      "retries": 0,
      "success": true,
      "estimatedCostUsd": null,
      "verifiedCostUsd": null,
      "rateVersion": null,
      "domain": "party_perfect",
      "source": "local_collector",
      "humanTriggered": false,
      "status": "completed",
      "usageKind": "metered"
    }
  ]
}
```

Synthetic only. `domain` is `party_perfect` or `mershon_personal`.  
`usageKind`: `included` (plan allowance, not metered spend), `overage`, or `metered`.

Heartbeat / failure (no fake $0):

```json
{ "collectorId": "claude-mac", "events": [], "error": "timeout" }
```

## Responses

- `200` `{ accepted, duplicates, conflicts, rejected, errors }`
- `400` malformed / all rejected
- `401` missing/wrong bearer
- `413` payload too large
- `429` rate limited
- `503` ingest not configured

Do not log Authorization headers, tokens, prompts, transcripts, or provider keys.
