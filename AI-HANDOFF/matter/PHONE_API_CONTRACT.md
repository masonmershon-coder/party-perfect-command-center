# Matter phone API contract

Version 1. Gateway: `AI-HANDOFF/matter/phone-api.mjs`.
This is the iPhone contract. It is not the Party Perfect `/api/health` route and it is not public kituwa.app.

The gateway records tasks next to the supervisor data root. It does not start the supervisor, call a model, or execute work.

## Bind and authentication

- `MATTER_DATA_ROOT` must already exist and be a directory. A missing root exits 78 and is not created.
- `MATTER_PHONE_TOKEN` must be at least 16 characters. There is no default token.
- Default bind is `127.0.0.1`. `0.0.0.0` and `::` exit 78 unless `MATTER_PHONE_ALLOW_LAN=1`.
- Send `Authorization: Bearer <token>` on every route except the unauthenticated liveness check.
- Unauthenticated `GET /v1/health` returns only `{ "ok": true, "service": "matter-phone", "authenticated": false }`.
- Errors are `{ "error": { "code": "...", "message": "..." } }` with `cache-control: no-store`.
- Unknown JSON fields are rejected. Bodies are limited to 32 KB.
- The default rate limit is 60 requests per minute per remote address.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/health` | optional | Liveness, or supervisor snapshot when authenticated |
| GET | `/v1/tasks` | yes | Task list, newest first |
| GET | `/v1/tasks/:id` | yes | One task |
| POST | `/v1/tasks` | yes | Create a task and its conversation |
| POST | `/v1/conversations` | yes | Same create path |
| GET | `/v1/conversations` | yes | Conversations with messages |
| GET | `/v1/approvals?status=PENDING` | yes | Approval inbox |
| POST | `/v1/approvals/:taskId` | yes | `{ "decision": "approve" \| "reject", "note"?: string }` |
| GET | `/v1/agents` | yes | Registry rows plus supervisor availability |
| GET | `/v1/activity` | yes | Append-only phone activity |
| POST | `/v1/tasks/:id/execute` | yes | Always 403 `execution_refused` |

Create body:

```json
{ "client_message_id": "string", "text": "string", "source": "text", "classification": "SAFE" }
```

`source` is `text` or `voice`. `classification` is optional. The same `client_message_id` returns the original task with `duplicate: true`.

A protected action, or `classification: "APPROVAL_REQUIRED"`, is stored as `WAITING_APPROVAL` and is not executed. A client claim of `SAFE` does not override protected language. Approval sets `READY` and `executed: false`. Rejection sets `BLOCKED` and `executed: false`. A second, different decision returns 409 `already_decided`.

Agent `available` is `true` or `false` only when `CORE_HEALTH.json` lists that worker. Otherwise it is `null` and `availability_source` is `not_in_supervisor_health`. Probe commands are not returned.

Authenticated health sets `supervisor_healthy` only when the health file exists, its pid is running, and `last_pass_at` is within 90 seconds. A leftover health file is not reported as a live supervisor.

Durable files, both inside `MATTER_DATA_ROOT`:

- `PHONE_TASKS.json`
- `PHONE_ACTIVITY.jsonl`
