# Sentinel Permission & Data-Classification Matrix

**Phase 1 deliverable** · **Status:** ready for Codex review · **Date:** 2026-08-13 · **Owner:** Claude
**Governing review:** `AI-HANDOFF/EVIDENCE/SENTINEL_ARCHITECTURE_REVIEW_2026-08-13.md`

> **DEFAULT DENY.** A source, field, event type or action that is not listed here does not exist for Sentinel.
> Nothing appears in this matrix because a model thought it would be useful. Each row exists because a named detection requires it.
> **Collectors redact before the analyst sees anything.** The analyst never reads a raw source.

---

## Data classifications

| Class | Meaning | May reach the analyst? |
|---|---|---|
| `PUBLIC` | externally observable | yes |
| `OPERATIONAL` | system state, no personal data | yes |
| `INTERNAL_REF` | identifiers/hashes standing in for sensitive values | yes, as reference only |
| `SENSITIVE_PII` | applicant/customer personal data | **no** — count and classification only |
| `SECRET` | credentials, keys, tokens, cookies, connection strings | **never collected at all** |

## The matrix

### 1 · Authentication events

| | |
|---|---|
| **Identity** | `sentinel.read.auth` — read-only auth-event scope |
| **Readable** | event type, outcome, timestamp, role, session id **hash**, source IP **/24 prefix**, user agent **family**, failure count |
| **Prohibited** | password, hash, MFA secret/recovery code, session cookie, full IP, full user agent, email/phone |
| **Redaction** | session id → SHA-256 prefix · IP → /24 · user agent → family only |
| **Retention** | 90 days · `OPERATIONAL` |
| **Events** | `REPEATED_AUTH_FAILURE` · `OWNER_CODE_FAILURE` · `ROLE_CHANGE` · `SESSION_ANOMALY` · `ACCOUNT_LOCKOUT` |
| **Auto actions** | rate-limit one source · open security case |
| **Approval tier** | 2 |
| **Owner-only** | disable an employee · reset MFA · rotate credentials |

### 2 · Command Center / web & API security

| | |
|---|---|
| **Identity** | `sentinel.read.web_security` — unauthenticated external probe only |
| **Readable** | response headers, TLS metadata, status codes, route+method auth outcome, CORS policy, dependency advisory ids |
| **Prohibited** | response bodies of authenticated routes, customer/applicant data, secrets in config |
| **Redaction** | bodies never stored; header names/values only |
| **Retention** | 180 days · `PUBLIC` |
| **Events** | `SECURITY_HEADERS_MISSING` · `AUTH_BOUNDARY_REGRESSION` · `CORS_TOO_PERMISSIVE` · `SECRET_IN_RESPONSE` · `SOURCEMAP_EXPOSED` |
| **Auto actions** | open security case · route defect to Cursor |
| **Approval tier** | 1 |
| **Owner-only** | deploy · rollback · change CORS in production |

### 3 · Agent health

| | |
|---|---|
| **Identity** | `sentinel.read.agent_health` |
| **Readable** | agent name, heartbeat time, state, current task id, retry count, duplicate-claim count, tool **domain** (not arguments) |
| **Prohibited** | **full prompts**, model outputs, task payload contents, any embedded business data |
| **Redaction** | prompts never collected; tool calls reduced to domain + verb |
| **Retention** | 30 days · `OPERATIONAL` |
| **Events** | `AGENT_HEARTBEAT_STALE` · `RETRY_LOOP` · `DUPLICATE_TASK_CLAIM` · `AGENT_OUT_OF_LANE` |
| **Auto actions** | pause **one** task · stop retries for **one** task · lower **one** worker to read-only (time-limited) |
| **Approval tier** | 2 |
| **Owner-only** | disable an agent permanently · revoke a company credential |

### 4 · Matter policy events

| | |
|---|---|
| **Identity** | `sentinel.read.control_plane` — read-only; **no write access to Matter's queue** |
| **Readable** | decision code, tier, resource name, actor identity, rule id, timestamp |
| **Prohibited** | approval-token values, Matter's signing key, task payload bodies |
| **Retention** | 180 days · `OPERATIONAL` |
| **Events** | `REPEATED_POLICY_DENIAL` · `APPROVAL_BYPASS_ATTEMPT` · `TIER_ESCALATION_ATTEMPT` |
| **Auto actions** | open security case · notify inbox |
| **Approval tier** | 2 |
| **Owner-only** | change policy · grant an exception |

### 5 · POR bridge & replication

| | |
|---|---|
| **Identity** | `sentinel.read.replication` — reads the **replication state file only**. **No SQL identity. No POR credential. No database connection of any kind.** |
| **Readable** | last success time, batch id, row counts, checksum results, quarantine count, error strings |
| **Prohibited** | POR row contents, customer records, SQL credentials, connection strings |
| **Retention** | 90 days · `OPERATIONAL` |
| **Events** | `REPLICATION_STALE` · `REPLICATION_NEVER_RAN` · `BATCH_QUARANTINED` · `UNEXPECTED_WRITE_ATTEMPT` |
| **Auto actions** | mark a snapshot `STALE`/`UNTRUSTED` |
| **Approval tier** | 2 |
| **Owner-only** | **anything touching POR or SQL** — Sentinel has no path to either |

### 6 · Backup & storage

| | |
|---|---|
| **Identity** | `sentinel.read.backup` — metadata only |
| **Readable** | backup timestamp, file counts, checksum verification result, mount status, free space, restore-test date |
| **Prohibited** | **backup contents**, applicant/customer data inside backups, encryption keys |
| **Retention** | 365 days · `OPERATIONAL` |
| **Events** | `BACKUP_STALE` · `BACKUP_MISSING` · `RESTORE_NEVER_TESTED` · `CHECKSUM_MISMATCH` · `STORAGE_UNMOUNTED` |
| **Auto actions** | open security case |
| **Approval tier** | 1 |
| **Owner-only** | delete a backup · change retention |

### 7 · Cost / compute anomaly

| | |
|---|---|
| **Identity** | `sentinel.read.agent_health` (shared scope) |
| **Readable** | run counts, durations, block codes, token counts, cost basis |
| **Prohibited** | billing credentials, payment methods, invoice contents |
| **Retention** | 180 days · `OPERATIONAL` |
| **Events** | `COMPUTE_RUN_ANOMALY` · `UNAUTHORIZED_COMPUTE` · `BUDGET_BREACH` |
| **Auto actions** | pause one task · open case |
| **Approval tier** | 2 |
| **Owner-only** | change billing · raise a spend limit · buy anything |

### 8 · AI input screening (untrusted business data)

| | |
|---|---|
| **Identity** | `sentinel.action.quarantine_artifact` |
| **Readable** | **pattern-match signals and counts only** |
| **Prohibited** | **the matched text itself** — repeating it into an event or prompt *is* the injection · applicant/customer PII · resume contents |
| **Redaction** | store artifact **reference + signal count**, never content |
| **Retention** | 90 days · `INTERNAL_REF` |
| **Events** | `PROMPT_INJECTION_SUSPECTED` · `LOG_POISONING_SUSPECTED` |
| **Auto actions** | quarantine **one** artifact from AI processing |
| **Approval tier** | 2 |
| **Owner-only** | reject an applicant · contact an applicant |

---

## Component boundaries (for Codex review)

```
  source systems
        │  source-specific least-privilege identity, one per collector
        ▼
  COLLECTORS ──────── redact HERE, before anything leaves
        │  classified, minimized events
        ▼
  EVIDENCE LEDGER ─── append-only · content+linkage hash chain
        │              raw evidence is IMMUTABLE
        │  read-only view
        ▼
  ANALYST (AI) ────── correlates, explains, PROPOSES
        │  proposal only — never an authorization
        ▼
  CONTAINMENT BROKER  deterministic allowlist · NOT an LLM
        │  rejects anything unnamed
        ▼
  bounded action  ·  OR  ·  Security Inbox → Mason

  WATCHDOG ────────── separate process, separate identity
                      reports Sentinel health; Sentinel cannot self-declare healthy
```

**Separation rules, explicit:** the analyst holds **no** collector identity and **no** broker capability. The broker performs **no** reasoning. The ledger accepts appends but **never edits**. The watchdog shares nothing with Sentinel. Matter and Sentinel share **no** process, account, key, token, write role, queue, release approval, or health monitor.

**Interpretation is separate from evidence.** An analyst conclusion is written as a *new* record referencing the original event id. A correction never mutates the original.

## Degraded-mode contract

| Sentinel state | System behaviour |
|---|---|
| `HEALTHY` | normal |
| `DEGRADED` / `STALE` / `OFFLINE` | POR runs · Command Center available · **remote employees keep working** · Matter policy stays active · Tier 0/1 continues · high-risk autonomous actions → `WAITING_APPROVAL` · no new high-risk capabilities issued · collectors buffer bounded events · watchdog raises **one** alert · Command Center shows **SECURITY MONITORING DEGRADED** |
| suspected `COMPROMISED` | **revoke Sentinel's identity — do not shut down the business** |

**Sentinel is never inline.** It observes; it is not in the request path. If it dies, nobody is locked out.

## Open items for Codex

1. Are the eight collector scopes genuinely least-privilege, or does any readable field exceed what its named detections require?
2. Does any auto action fail the scoped/reversible/time-limited/idempotent test?
3. Can the analyst reach a collector identity or broker capability through any path?
4. Is `SENSITIVE_PII` truly unreachable by the analyst given the redaction points?
5. Does the degraded-mode contract leave any way to report HEALTHY without monitoring evidence?
