# Matter phone API contract

Version 2. Gateway: `AI-HANDOFF/matter/phone-api.mjs`.
This is the iPhone contract for the published Core Alpha ledger. It is not the Party Perfect `/api/health` route and it is not public kituwa.app.

The authoritative task record is `LEASES.json`, written only through `execution.mjs`. The gateway does not create `PHONE_TASKS.json` or a separate approval journal. Activity is `LEASE_LOG.jsonl`.

Commit `560585c` and its intake service are not on origin. When that contract is published, this gateway should call it instead of `execution.enqueue`. Until then, phone tasks are ledger rows with `requirements.origin = "matter-phone"`.

## Authority

The phone cannot classify a task. `classification` is not an accepted field. The server classifies the text. Protected language is stored as `WAITING_APPROVAL`. `execution.lease` refuses that state. Approve records the decision on the ledger and releases the task to `QUEUED`. Reject records the decision and sets `BLOCKED`. Neither path starts a worker. `POST /v1/tasks/:id/execute` returns 403.

Device authentication in the app is an extra confirmation. It does not authorize the task. A request without a valid bearer token is rejected.

## Bind and authentication

- `MATTER_DATA_ROOT` must already exist. A missing root exits 78 and is not created.
- `MATTER_PHONE_TOKEN` must be at least 16 characters. There is no default.
- Optional `MATTER_PHONE_TOKEN_NOT_AFTER` is an ISO timestamp. After it, a matching bearer token returns 401 `session_expired`.
- Loopback HTTP is allowed for a process on the Mac itself.
- Any other address must be a private IP, `MATTER_PHONE_ALLOW_LAN=1` must be set, and both `MATTER_PHONE_TLS_CERT` and `MATTER_PHONE_TLS_KEY` must point at files. `0.0.0.0`, `::`, and public addresses exit 78.
- Unauthenticated `GET /v1/health` returns only `{ "ok": true, "service": "matter-phone", "authenticated": false }`.
- Errors are `{ "error": { "code": "...", "message": "..." } }`.
- Unknown JSON fields are rejected. Bodies are limited to 32 KB.
- The default rate limit is 60 requests per minute per remote address.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/health` | optional | Liveness, or supervisor snapshot when authenticated |
| GET | `/v1/mission` | yes | Supervisor, queue counts, pending approvals, workers, local intelligence |
| GET | `/v1/tasks` | yes | Phone tasks from `LEASES.json` |
| GET | `/v1/tasks/:id` | yes | One phone task |
| POST | `/v1/tasks` | yes | Enqueue a ledger task |
| POST | `/v1/conversations` | yes | Same create path |
| GET | `/v1/conversations` | yes | Messages stored on the ledger task |
| GET | `/v1/approvals?status=PENDING` | yes | Derived from ledger state |
| POST | `/v1/approvals/:taskId` | yes | `{ "decision": "approve" \| "reject", "note"?: string }` |
| GET | `/v1/agents` | yes | Registry rows plus supervisor availability |
| GET | `/v1/activity` | yes | `LEASE_LOG.jsonl` |
| POST | `/v1/tasks/:id/execute` | yes | Always 403 `execution_refused` |

Create body:

```json
{ "client_message_id": "string", "text": "string", "source": "text" }
```

`source` is `text` or `voice`. The same `client_message_id` returns the original ledger task with `duplicate: true`.

Agent `available` is `true` or `false` only when `CORE_HEALTH.json` lists that worker. Otherwise it is `null`. Probe commands and local model endpoints are not returned. `local_intelligence.available` stays `null` until supervisor health observes that worker.

Authenticated health sets `supervisor_healthy` only when the health file exists, its pid is running, and `last_pass_at` is within 90 seconds.
