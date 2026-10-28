# Matter phone API contract

Version 3. Gateway: `AI-HANDOFF/matter/phone-api.mjs`.
This is an observation and forwarding contract for the iPhone. It is not the Party Perfect `/api/health` route and it is not public kituwa.app.

Claude's intake, approval journal, device authentication, and execution controls are the source of truth. Commits `83e9c21` (`agent/matter-mobile-api`) and `e041ad5` (`agent/matter-ios-app`) were not on origin when this version was written, so the forwarded JSON is a proposal for Claude to confirm. This gateway does not classify tasks and does not record approval decisions.

`LEASES.json` and `LEASE_LOG.jsonl` stay the Core execution ledger. GET routes only read them. The gateway does not create `PHONE_TASKS.json`.

## Authority

The phone cannot classify a task. `classification` is not an accepted field.

`POST /v1/tasks` and `POST /v1/conversations` do not write the ledger.

- With no `MATTER_INTAKE_URL`, the response is 503 `intake_required`.
- With `MATTER_INTAKE_URL` set, the gateway forwards `{ "client_message_id", "text", "source" }` and returns the upstream JSON status. It does not add a classification.

`POST /v1/approvals/:taskId` does not call `release`, `block`, or any local approval writer.

- With no `MATTER_APPROVAL_URL`, the response is 503 `approval_journal_required`.
- With `MATTER_APPROVAL_URL` set, the gateway forwards `{ "task_id", "decision", "note" }`. `note` is null when omitted.

An upstream that does not respond returns 502 `upstream_unreachable`. A non-JSON upstream body returns 502 `upstream_invalid`. `POST /v1/tasks/:id/execute` returns 403 `execution_refused`.

Device authentication in the app is an extra confirmation before the request is sent. It does not authorize the task. A request without a valid bearer token is rejected.

`MATTER_INTAKE_URL` and `MATTER_APPROVAL_URL` must be `https`, or `http` on loopback, and must not include a username or password. Anything else exits 78 before the process listens.

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
| GET | `/v1/tasks` | yes | Phone-origin rows already present in `LEASES.json` |
| GET | `/v1/tasks/:id` | yes | One phone-origin ledger task |
| POST | `/v1/tasks` | yes | Forward to intake, or 503 |
| POST | `/v1/conversations` | yes | Same forward path |
| GET | `/v1/conversations` | yes | Messages already stored on a phone-origin ledger task |
| GET | `/v1/approvals?status=PENDING` | yes | Derived from ledger state |
| POST | `/v1/approvals/:taskId` | yes | Forward `{ "decision": "approve" \| "reject", "note"?: string }`, or 503 |
| GET | `/v1/agents` | yes | Registry rows plus supervisor availability |
| GET | `/v1/activity` | yes | `LEASE_LOG.jsonl` |
| POST | `/v1/tasks/:id/execute` | yes | Always 403 `execution_refused` |

Create body:

```json
{ "client_message_id": "string", "text": "string", "source": "text" }
```

`source` is `text` or `voice`. The gateway does not deduplicate `client_message_id`. Intake owns that.

`GET /v1/tasks` includes a ledger row only when `requirements.origin` is `matter-phone`. Rows written by another intake without that marker are not listed. That filter needs Claude's review against `83e9c21`.

Agent `available` is `true` or `false` only when `CORE_HEALTH.json` lists that worker. Otherwise it is `null`. Probe commands and local model endpoints are not returned. `local_intelligence.available` stays `null` until supervisor health observes that worker.

Authenticated health sets `supervisor_healthy` only when the health file exists, its pid is running, and `last_pass_at` is within 90 seconds. A missing classification on a ledger row is returned as `null`.
