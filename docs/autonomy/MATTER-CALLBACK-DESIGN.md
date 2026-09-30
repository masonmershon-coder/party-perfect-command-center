# Matter Worker Callback — Contract (preview/local only)

Status: **IMPLEMENTED ON A DRAFT BRANCH — preview/local only, not deployed, not wired to production.**
Code: `lib/matter/callback/*`, `app/api/matter/callback/route.ts`. Tests: `scripts/test-matter-callback.ts` (`npm run test:matter-callback`).

Authority: **Matter / AI Core is the only task authority.** This endpoint records events Matter (or a
lease-holding worker) reports into a *projection* and refuses events that are impossible from the
recorded state. It never routes work, assigns workers, grants permissions, certifies verification,
merges, deploys, migrates, writes POR/SQL, or sends messages. GitHub comments/PRs remain
evidence/transport only and never feed this state.

## 1. Endpoint and gate

`POST /api/matter/callback` — `runtime = "nodejs"`, JSON only, machine principal (listed in
`MACHINE_API_ROUTES` / `MACHINE_API_PREFIXES`; no cookies accepted).

The route answers `404 CALLBACK_DISABLED` unless **all** hold:

- `VERCEL_ENV !== "production"` (hard refusal in production, regardless of other env),
- `MATTER_CALLBACK_ENABLED === "1"`,
- `MATTER_CALLBACK_KEYS` parses into a valid key ring (fail closed on any malformed entry).

`GET` → `405 METHOD_NOT_ALLOWED`. Body is streamed with a hard cap of **64 KiB**; larger bodies are
refused with `413` without being fully buffered.

### Environment variable names (values never committed)

| Name | Meaning |
|---|---|
| `MATTER_CALLBACK_ENABLED` | `"1"` enables outside production |
| `MATTER_CALLBACK_KEYS` | JSON key ring `{ "<key_id>": { "principal", "role": "matter"\|"worker", "domains": [...], "secret" (≥32 chars) } }` |
| `MATTER_CALLBACK_STORE` | `memory` (default) or `file` (local only) |
| `MATTER_CALLBACK_DIR` | directory for the local file store |
| `MATTER_CALLBACK_RATE_PER_MIN` | per-key limit, default 120 |
| `MATTER_CALLBACK_MAX_SKEW_SEC` | timestamp window, default 300, max 900 |

## 2. Signed requests

| Header | Value |
|---|---|
| `X-Matter-Key-Id` | key id (rotation = add new id, move sender, delete old id) |
| `X-Matter-Timestamp` | Unix seconds |
| `X-Matter-Nonce` | 16–128 chars `[A-Za-z0-9_-]`, unique per delivery |
| `X-Matter-Signature` | `v1=<hex HMAC-SHA256(secret, "v1:" + ts + ":" + nonce + ":" + rawBody)>` |

Processing order (`processMatterCallback`):

1. size limit → `413`
2. signature: constant-time compare over the **raw bytes**; unknown key ids are compared against a
   dummy secret so timing does not reveal which ids exist → `401 SIGNATURE_INVALID`
3. timestamp window (checked only after a valid signature) → `401 TIMESTAMP_OUT_OF_WINDOW` (retryable after clock resync)
4. per-key rate limit → `429 RATE_LIMITED`
5. replay: `recordNonce(key_id|nonce)` atomic check-and-set, retained for 2× the window → `409 REPLAY_DETECTED`
6. JSON parse → `400`; strict schema (allowlisted fields, formats, per-event requirements) → `422`
7. credential-shaped values anywhere in the body → `422 SECRET_IN_PAYLOAD`
8. domain must be in the key's `domains` → `403 DOMAIN_FORBIDDEN`
9. role: event must be allowed for the key's role; a worker key may only report for its own `worker_id` → `403 ROLE_FORBIDDEN`
10. per-task (or per-worker) in-process lock, then idempotency, transition check, atomic commit.

## 3. Events

`worker_registered, task_claimed, heartbeat, evidence_submitted, verification_rejected,
repair_started, repair_submitted, verification_passed, task_closed, worker_failed, lease_expired,
task_dead_lettered` (schema_version 1).

Common fields: `event_id`, `idempotency_key`, `event_type`, `domain`, `occurred_at`, `worker_id`.
Optional: `task_id`, `message_id`, `verifier_id`, `lease{lease_id,expires_at}`,
`evidence{digest:"sha256:<64hex>", ref:<relative ref, no absolute paths or "..">}`, `reason_code`,
`retryable`, `capabilities`. Unknown fields are rejected. Validation errors name fields only and
never echo submitted values.

Role permissions: the `matter` role may emit every event. A `worker` key may emit only
`heartbeat, evidence_submitted, repair_started, repair_submitted, worker_failed`, only for itself,
and (for task events) only while it is the recorded lease holder. Workers cannot claim, verify,
close, expire leases, dead-letter, or register themselves.

## 4. Transition matrix

| Event | From | To |
|---|---|---|
| task_claimed | QUEUED (or unseen task) | CLAIMED |
| heartbeat | CLAIMED / IN_PROGRESS / REPAIRING | IN_PROGRESS / same |
| evidence_submitted | CLAIMED / IN_PROGRESS | AWAITING_VERIFICATION |
| verification_rejected | AWAITING_VERIFICATION | NEEDS_REPAIR |
| repair_started | NEEDS_REPAIR | REPAIRING |
| repair_submitted | REPAIRING | AWAITING_VERIFICATION |
| verification_passed | AWAITING_VERIFICATION | VERIFIED |
| task_closed | VERIFIED | CLOSED |
| worker_failed / lease_expired | CLAIMED / IN_PROGRESS / REPAIRING / NEEDS_REPAIR | QUEUED (lease cleared, reclaimable) |
| task_dead_lettered | any non-terminal | DEAD_LETTERED |

`CLOSED` and `DEAD_LETTERED` are terminal: any later event → `409 TASK_TERMINAL` (stale events
cannot reopen). Other impossible moves → `409 INVALID_TRANSITION`. `verifier_id` equal to the
assigned worker → `403 VERIFIER_NOT_INDEPENDENT`. A heartbeat with a different `lease_id` →
`403 NOT_LEASE_HOLDER`. Events for an unknown task (other than `task_claimed`) → `409 UNKNOWN_TASK`
(retryable: ordering).

## 5. Idempotency and duplicates

Scope: `domain | idempotency_key`. Evaluated under the task lock:

- unseen → process; the response is stored with the idempotency record in the same commit;
- seen, same body hash → the **original** status/body with `duplicate: true`, no new effect, no new audit row;
- seen, different body hash → `422 IDEMPOTENCY_CONFLICT` (audited).

Redelivery uses the same body with a **fresh** nonce/timestamp/signature. Replaying the exact signed
request is refused by the nonce check before idempotency is consulted.

Atomicity: `commit()` writes the idempotency record, projection change and audit row together and
refuses a scope that already exists, so even without the lock a duplicate cannot produce a second
effect. The in-process lock is per isolate; the shared-store design (section 9) moves both guarantees
into the store.

## 6. Audit

Append-only. One `accepted` row per effect (written inside the commit) and one `rejected` row per
authenticated rejection (replay, schema, domain, role, transition, conflict). Unauthenticated
failures (bad signature, stale timestamp, oversize) are logged only — there is no trustworthy
identity to record. Rows contain identifiers, codes, from/to state and `body_sha256`; never bodies,
signatures, secrets or evidence content. `listAudit()` returns frozen copies; there is no update or
delete API.

## 7. Retry classification and dead-letter

Every response carries `{ ok, code, retryable }`. Senders retry only when `retryable: true`
(`TIMESTAMP_OUT_OF_WINDOW`, `RATE_LIMITED`, `UNKNOWN_TASK`, `UNKNOWN_WORKER`, `STORE_UNAVAILABLE`,
`INTERNAL_ERROR`), with exponential backoff + jitter, same body and idempotency key, new
nonce/timestamp/signature. If the commit fails after validation, the verified event is written to
the dead-letter list and `503 STORE_UNAVAILABLE` (retryable) is returned; the idempotency scope is
not consumed, so the retry succeeds once the store recovers. `task_dead_lettered` is a separate,
Matter-emitted lifecycle event.

## 8. Logging and responses

Log lines (`kind: "matter_callback"`) carry level, code, internal reason, key id, principal,
event id/type and task id only. Responses never include secrets, signatures, key material, raw
bodies, filesystem paths or submitted values. Test 12 scans responses, logs and audit rows for
every test secret and for signature patterns.

## 9. Stores and production path (not implemented)

- `MemoryCallbackStore` (default): process-local, lost on restart. Suitable for preview smoke only.
- `FileCallbackStore` (`MATTER_CALLBACK_STORE=file`): local disk, tmp+rename state file plus
  `CALLBACK_AUDIT.jsonl` mirror. Refuses to run when `VERCEL` is set.
- **No Redis store was added.** Preview deployments may share the production Upstash instance, so
  writing callback state there from preview would be a production write.

Production requires an owner decision and Codex review. Recommended path: persist through AI Core
(Postgres) with (a) a unique constraint on `(domain, idempotency_key)` and `INSERT … ON CONFLICT DO
NOTHING RETURNING` for atomic duplicate suppression across instances, (b) an append-only audit
table (no UPDATE/DELETE grants), (c) nonce rows with TTL cleanup, and (d) a shared rate-limit counter
(`INCR` + `EXPIRE` on a dedicated Redis key prefix, or a Postgres token bucket). This overlaps with
draft PR #11 (AI Core idempotency) and must be reconciled with it; no migration is included here.

## 10. Unproven

- No real Matter sender exists yet; events are produced by tests and the local smoke only.
- No external wake: the endpoint records events and does not notify or start any worker.
- Rate limiting and locking are per process; multi-instance guarantees depend on section 9.
- Not exercised on a Vercel preview deployment.
