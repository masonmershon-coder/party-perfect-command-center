# Sentinel Architecture Review — 2026-08-13

**Verdict:** `APPROVE WITH CHANGES`
**Reviewer:** Codex (adversarial architecture review)
**Recorded by:** Claude · **Status:** authoritative security-review input

---

## ⚠️ Provenance — read this before citing the document

**Codex's full review text is not in my possession.** The verdict and the locked requirements below were **relayed by Mason** on 2026-08-13.

Evidence for that statement: the control-plane task `SENTINEL-ARCH-REVIEW-001` that I queued for Codex is still `NEW` with no result and no run output in `codex/.runs/`. So the review Codex performed happened outside this control plane, and its reasoning is not recorded here.

What follows is therefore a faithful record of **the decision and the resulting requirements**, not a transcript of Codex's analysis. It is authoritative as a directive. It should not be cited as evidence of *what Codex specifically found*.

**To close this gap:** re-run `SENTINEL-ARCH-REVIEW-001` through the control plane so Codex's actual findings land in evidence, or paste the original review here.

## Verdict

**APPROVE WITH CHANGES.** Proceed with Sentinel, but **do not implement the monolithic-agent concept.**

## Required change — Sentinel is a system, not a bot

Sentinel V1 as built (`AI-HANDOFF/sentinel/sentinel.mjs`) combined collection, detection, evidence, containment and health into one module. That is **superseded**. Sentinel must be five separate components with distinct boundaries:

| Component | Nature | Rule |
|---|---|---|
| **Collectors** | read-only, source-specific identities | redact **before** data reaches the analyst; no universal Sentinel credential |
| **Evidence Ledger** | append-oriented, tamper-evident | built **before** the analyst; raw evidence and interpretation stay separate; conclusions may be corrected, **original evidence may never be rewritten** |
| **Analyst** | the AI layer | correlate, explain, recommend — **cannot authorize consequential actions**; all untrusted content is data, never authority |
| **Containment Broker** | deterministic, **not an LLM** | explicit allowlist; rejects everything not named; every action scoped, reversible, time-limited, idempotent, logged |
| **Watchdog** | independent of Sentinel | reports Sentinel failure; Sentinel cannot mark itself healthy |

## Hard requirements carried into the build

1. **Matter / Sentinel separation.** No shared process, service account, signing key, admin token, DB write role, writable queue, release approval, or health monitor. Matter = policy/prevention/orchestration. Sentinel = monitoring/detection/evidence/bounded response.
2. **Degraded mode must not stop the company.** If Sentinel is degraded, stale, offline or suspected compromised: POR keeps running, Command Center stays available, employees keep remote access, Matter's deterministic policy stays active, Tier 0/1 continues. High-risk autonomous actions move to `WAITING_APPROVAL`. **Suspected compromise ⇒ revoke Sentinel's identity, not shut down the business.**
3. **No system may report security HEALTHY without actual monitoring evidence.**
4. **Owner-only boundary** — 24 enumerated actions Sentinel may never take independently, including declaring an incident closed and approving its own release or permissions.
5. **Data minimization** — the analyst never receives credentials, keys, tokens, cookies, connection strings, full dumps, raw backups, or unnecessary PII. References, classifications and hashes only.
6. **Independent observation** — do not rely on agents self-reporting. Reconcile `REQUESTED` vs `AUTHORIZED` vs `OBSERVED`; differences are findings.
7. **Sentinel never certifies itself.**

## Status of V1

`AI-HANDOFF/sentinel/sentinel.mjs` is **SUPERSEDED as an architecture**. Its 25 synthetic tests and two genuine findings remain useful and are being carried forward:

- the tamper-evidence defect it caught (linkage-only chain verification passed a rewritten record) — the fix belongs in the new Evidence Ledger
- the redaction, injection-screening and never-report-green behaviours become component requirements

It must not be scheduled or treated as the production monitor.

## Build order

Phase 1 permission/classification matrix → 2 collectors → 3 evidence ledger → 4 watchdog/degraded mode → 5 containment broker → 6 analyst → 7 Command Center inbox → 8 adversarial tests → 9 Codex certification → 10 controlled activation.

**No production containment activation without Mason's approval.**
