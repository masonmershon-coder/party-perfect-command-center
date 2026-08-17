# TALK-TO-MIKE-INTAKE-001 — verification bundle for Codex

**Published:** 2026-08-13 · **Publisher:** Claude · **Certifier:** Codex (owns the verdict)
**Prior verdict:** BLOCKED — *not rejected, not certified*

> **Read the source, not this file.** Every claim below is a pointer to code you can open at
> the commit named here. Where this document describes behaviour, treat the description as a
> **claim to attack**, not as evidence. The evidence is the diff and the tests.

---

## 1–4 · Repository, branch, commit, diff

| | |
|---|---|
| Repository | `/Users/mikeai/grok-dashboard` (remote `github.com/masonmershon-coder/party-perfect-command-center`) |
| Branch | **`agent/cursor/TALK-TO-MIKE-INTAKE-001`** |
| Commit SHA | **`7772b1e88cf802b182f7ca00e22cc5e8f4612351`** |
| Parent | `e3e30e41f63752b0c675cd4510426d14f7180910` (`main`) |
| Diff | `git show 7772b1e` · `git diff e3e30e4..7772b1e` |
| Size | 23 files, **2,464 insertions, 0 deletions** (pure addition) |
| Pushed to remote? | **NO** — local branch only |
| Deployed? | **NO** |

### Why Codex was blocked — the actual root cause

**The implementation had never been committed.** All 23 files were untracked (`??`) in the
working tree. There was no commit SHA and no diff, so the evidence Codex requires did not
exist in a form any verifier could reference.

That is a **control-plane defect, not an implementation defect** — which matches the prior
verdict exactly: not rejected, not certified, unverifiable.

The commit is deliberately **local and unpushed**. Pushing is a separate act that could trigger
a preview deployment, and deployment is denied. Codex runs on this machine and reads this repo,
so a local commit is sufficient for independent inspection.

### Scope discipline

The tree held 44 uncommitted paths. **Exactly 23 were staged** — the Talk-to-Mike set and
nothing else. Unrelated work (Golden Transaction docs, control-plane state, Sentinel) was
deliberately left uncommitted. Verify with `git show --stat 7772b1e`.

---

## 5 · Migration `0007` — **HELD, NOT APPLIED**

`supabase/migrations/0007_mike_remote_intake.sql` (106 lines).

| Object | Line |
|---|---|
| `ai_core.intake_devices` | 8 |
| `ai_core.intake_commands` | 20 |
| index `intake_commands_state_idx` | 46 |
| index `intake_commands_lease_idx` | 48 |
| `ai_core.intake_events` | 51 |
| index `intake_events_msg_idx` | 62 |
| `ai_core.intake_worker_heartbeats` | 65 |
| index `intake_worker_hb_idx` | 71 |
| RLS enabled on every table | 79 |
| `service_role`-only policies | 83 |

`scripts/apply-0007-mike-intake.mjs` exists but **has not been run**. Applying it is not
authorized.

---

## 6 · Intake API

| Concern | File |
|---|---|
| CREATE | `app/api/mike/intake/route.ts` |
| COMPLETE | `app/api/mike/intake/complete/route.ts` |
| STATUS | `app/api/mike/intake/[id]/route.ts` |
| Core logic | `lib/mike-intake.ts` (522 lines) |
| Device auth | `lib/mike-intake-auth.ts` (109 lines) |
| Policy / validation | `lib/mike-intake-policy.ts` (191 lines) |

**Claims to attack in `mike-intake-auth.ts`:**

- tokens compared as SHA-256 hex (`sha256Hex`, line 13) using `timingSafeEqual` (line 28)
- **query-string tokens rejected even when a valid header is present** — line 37
- per-sender revocation via env (`..._REVOKED`, lines 59 / 67)
- sender identity is derived from the token, never from the request body (lines 57, 65)

**Sender isolation:** STATUS must return only the requesting sender's row. Test
`Mason/Josh separation` covers it; confirm the SQL predicate independently.

**Idempotency:** caller-supplied UUID. Same key + same content ⇒ original message returned.
Same key + *different* content ⇒ rejected. Both paths are tested; verify the conflict branch
cannot be made to overwrite.

---

## 7 · Worker

| Endpoint | File |
|---|---|
| lease | `app/api/mike/intake/worker/lease/route.ts` |
| ack | `app/api/mike/intake/worker/ack/route.ts` |
| fail | `app/api/mike/intake/worker/fail/route.ts` |
| heartbeat | `app/api/mike/intake/worker/heartbeat/route.ts` |

Two interchangeable backends — attack both:

- `lib/mike-intake-pg.ts` (264 lines) — production Postgres
- `lib/mike-intake-memory.ts` (195 lines) — in-memory, used by the tests

**A real risk to probe:** the tests exercise the *memory* backend. If `mike-intake-pg.ts`
diverges in lease/retry semantics, the suite would pass while production misbehaves. Compare
`leaseNext` and the dead-letter transition in both (`pg` lines 150, 194; `memory` lines 80, 122)
and report any behavioural difference as a finding.

Retry / dead-letter: `lib/mike-intake-policy.ts:143-159` — `not_leasable`, `lease_active`,
`not_queued`, `max_attempts`.

---

## 8 · Exact test command

```
npx tsx scripts/test-mike-intake.ts
```

## 9 · Test results — 2026-08-13, all passing

```
ok - unauthenticated intake
ok - wrong token
ok - token in query string rejected
ok - revoked token
ok - Mason/Josh separation
ok - idempotent retry same content
ok - key/content conflict
ok - oversized audio
ok - invalid media
ok - expired upload
ok - missing upload
ok - duplicate complete + queue lease + worker retry + dead letter
ok - ack delivered + optional audio delete
ok - PII/secret leakage guards
ok - rate limits
ok - RLS/access SQL denies authenticated on intake tables
ok - routes are machine-auth gated in source

Talk-to-Mike intake checks passed.
```

17 checks. Source: `scripts/test-mike-intake.ts` (491 lines).

**Known evidence limitation:** these run against the in-memory backend and a static read of the
SQL. **No test has run against a live Postgres with migration 0007 applied**, because 0007 is
held. Anything that can only be proven against a real database is therefore **unproven**, and
should not be certified on this bundle alone.

---

## 10 · Secret scan — clean

Run over all 23 files before commit:

- **High-signal patterns** — `sk-…`, `eyJ…` JWTs, `AKIA…`, `ghp_…`, `xox[baprs]-`, PEM private
  keys, `postgres://user:pass@`, `https://user:pass@` → **zero matches**
- **Assignment literals** — `password|secret|token|api_key|service_role|anon_key` assigned to a
  string literal, excluding `process.env` → **5 matches, all synthetic**, in
  `scripts/test-mike-intake.ts:24-28`, of the form `"test-mason-token-" + "a".repeat(40)`

No real credential is present in the commit. Re-run both scans yourself rather than trusting
this result.

---

## 11 · Shortcut specification

`docs/TALK_TO_MIKE_SHORTCUTS.md` (68 lines) — **placeholders only, no exported credential**.

- line 5 states the rule explicitly: real tokens never in file, git, tests, or AI-HANDOFF
- env names only (`MIKE_INTAKE_MASON_TOKEN_SHA256`, `..._JOSH_...`, `..._WORKER_...`)
- token generation is a local command the owner runs (`openssl rand -base64 48`), hashed via
  `scripts/hash-mike-intake-token.mjs`; the plaintext never leaves the device
- shortcut table uses `$MIKE_INTAKE_MASON_TOKEN` / `$MIKE_INTAKE_JOSH_TOKEN` placeholders
- line 32: one device token per shortcut, **Authorization header only, never a query parameter**

---

## 12 · Evidence pointers for the required list

| Requirement | Where | Status |
|---|---|---|
| Audio retention & cleanup | `lib/supabase-storage.ts` (127 lines); test `ack delivered + optional audio delete` | tested in-memory; **live storage unproven** |
| Logging / transcript redaction | `lib/mike-intake-telemetry.ts:1-20` — `logLooksSafe()` gates every emit and **returns early rather than logging** on failure; test `PII/secret leakage guards` | tested |
| Rate limits | `lib/mike-intake-rate-limit.ts` — Upstash sliding window with in-memory fallback (`memoryLimit`, line 7); `MIKE_INTAKE_CREATE_PER_HOUR` | tested |
| Storage / cost limits | `lib/mike-intake-policy.ts:8` `MIKE_INTAKE_MAX_BYTES = 20MB`, enforced line 112; test `oversized audio` | tested |
| Matter authorization boundary | intake **proposes**; it holds no approval capability | **claim — verify no bypass exists** |
| Protected-action approval gates | as above | **claim — attack it** |
| Mac-offline queue behaviour | queue + lease model; commands persist while no worker leases | **partially tested; real offline Mac unproven** |
| Worker crash / retry | lease expiry → requeue; `max_attempts` → dead letter (`policy.ts:143-159`) | tested in-memory |
| Command Center regression safety | pure addition, 0 deletions; no existing file modified | verify via `git show --stat` |
| Credentials absent from URLs/logs/Git/AI-HANDOFF | §10; query-string rejection `auth.ts:37`; redaction gate above | tested |

---

## Held / denied — unchanged by this publication

- migration `0007` — **HELD**, not applied
- production deployment — **DENIED**
- Mason / Josh / worker production tokens — **NOT PROVISIONED**
- branch — **not pushed**

## What Codex is being asked

Certify or reject **`7772b1e`** on the evidence above. Two things this bundle deliberately does
*not* claim: that the pg backend matches the memory backend, and that anything works against a
live database. If either matters for certification, the correct verdict is still BLOCKED — and
that would be a real finding, not a repeat of the missing-commit problem.
