# Cursor handoff — Matter API surface behind Kituwa.app

**From:** Claude (Matter runtime owner) · **Date:** 2026-08-18 · **For:** Cursor (web/PWA + API routes)
**Do not ask Mason to relay any of this.**

## Why this exists

Kituwa's Matter panel shows `DEGRADED`, `0 available workers`, `HAT NONE`, `BLOCKED`, and **no task,
message, routing, evidence or verifier IDs** — because **those endpoints do not exist**. Verified
read-only against production on 2026-08-18:

| Probe | Result |
|---|---|
| `GET https://kituwa.app/api/health` | **200** → `{ok:true, service:"party-perfect-command-center", version:"1.9.7"}` |
| `GET /api/matter` · `/api/matter/workers` · `/api/matter/tasks` · `/api/tasks` · `/api/workers` | **404 (all)** |

So kituwa.app is the **same Command Center codebase on a second domain**, running v1.9.7 with a
minimal health payload. partyperfect.app returns the rich payload (`porSyncConfigured`,
`porSnapshotPresent`, `porSyncedAt`); kituwa.app returns three fields. That alone explains
"Local Mac UNKNOWN" and "Cost UNKNOWN" in the panel.

**The runtime data already exists** — Matter produced a real durable loop locally today (below).
It has no way to reach the browser.

## Required endpoints (Cursor-owned)

All read-only, authenticated, no secrets in responses. Data source: the Matter runtime files on the
Mac (Claude will expose them through a local read-only service; contract below is what the UI consumes).

| Endpoint | Returns |
|---|---|
| `GET /api/matter/health` | Matter status + freshness envelope (see below) |
| `GET /api/matter/workers` | worker registry, redacted |
| `GET /api/matter/tasks/:task_id` | task detail incl. `message_id`, `idempotency_key` |
| `GET /api/matter/tasks/:task_id/events` | immutable event history |
| `GET /api/matter/routing/:task_id` | routing decision incl. considered/rejected/decisive factor |
| `GET /api/matter/evidence/:task_id` | evidence refs + digest (never raw transcripts) |
| `GET /api/matter/approvals` | items awaiting owner approval |

### Mandatory freshness envelope on EVERY response
```json
{ "source": "matter-registry@1.3.0", "observed_at": "2026-08-18T...Z",
  "last_success_at": "2026-08-18T...Z", "stale_after_seconds": 3600,
  "status": "HEALTHY|STALE|DEGRADED|DOWN", "error_reason": null }
```
**`status` must be derived from `observed_at` vs `stale_after_seconds`, never stored.** This is the
exact bug behind the panel: the registry stores `available:true` while the heartbeat is 66 hours
old. Compute freshness at read time.

### `GET /api/matter/workers` — shape
```json
{ "workers": [ { "worker_id":"codex-local", "provider":"openai", "model":"codex-cli",
  "version":"0.147.0", "local_or_remote":"local", "available":true,
  "last_heartbeat":"...", "heartbeat_age_seconds":42, "health":"HEALTHY",
  "capabilities":{"verification":{"claimed_level":0.9,"trusted_level":"DECLARED"}},
  "permissions":{"verification":false}, "policy_version_ack":"1.0.0+027e1c37c161",
  "policy_current":false, "cost_class":"subscription", "quality":{"score":null,"samples":0},
  "verification_history":{"verified":0,"rejected":0} } ], "envelope": { ... } }
```
**Never** return: probe commands, filesystem paths, tokens, PINs, PII, raw transcripts.
`score: null` must render as `n/a (n samples)` — never as `0`.

### `GET /api/matter/routing/:task_id` — shape
```json
{ "task_id":"MTR-76C41903", "router_version":"matter-registry", "policy_version":"1.3.0+111d69836ac9",
  "route":"DETERMINISTIC_SOFTWARE|WORKER", "primary":null, "verifier":"codex-local",
  "decisive_factor":"deterministic_first", "selection_basis":"...",
  "considered":[], "rejected":[{"worker_id":"x","reasons":["..."]}],
  "blocked":false, "owner_approval_required":false, "decided_at":"..." }
```
**`route:"DETERMINISTIC_SOFTWARE"` must NOT render as an assigned worker.** It means no model was
woken. Shadow decisions must never be displayed as executed assignments.

## Acceptance criteria

1. Panel shows a task's `message_id`, `task_id`, routing decision, evidence digest and verifier state.
2. A worker with a stale heartbeat renders **STALE/UNAVAILABLE** even though the stored record says `available:true`.
3. `score: null` renders `n/a`, never `0`.
4. `DETERMINISTIC_SOFTWARE` renders as "handled by deterministic software — no model used".
5. A blocked verification renders the **gate code** (e.g. `VERIFIER_POLICY_STALE`), not a generic error.
6. No secrets, PINs, tokens, PII or raw transcripts appear in any response.

## Security boundary

Read-only. No endpoint may grant a permission, change an assignment, or accept a verification
result — those are Matter-authority operations and stay server-side on the Mac. Ordinary workers
never receive Matter authority credentials.

## Live proof the data exists (local run, 2026-08-18)

```
message_id  MSG-C20B797079     idempotency 4c3e39791d57d213
task_id     MTR-76C41903
routing     route=DETERMINISTIC_SOFTWARE  (no model invoked)
execution   kituwa=200  command-center=200   (read-only HTTP)
evidence    AI-HANDOFF/EVIDENCE/closed-loop/MTR-76C41903.json
            digest 09125f4c3c7a54c6bedab371...
verification BLOCKED [VERIFIER_POLICY_STALE] -> [VERIFIER_NO_PERMISSION] -> [VERIFIER_CAPABILITY_UNTRUSTED]
```
Every one of those fields is what the panel should be showing and currently cannot.
