# GH-BRIDGE-001 — why the shared P0 issue never woke the local system

**Date:** 2026-08-13 · **Owner:** Claude · **Verifier:** Codex
**Status:** implemented and self-tested · **NOT CERTIFIED** — see the verification section

## Root cause — two independent faults

**1. The component did not exist.** Searching `AI-HANDOFF/` for `github` returned matches in
exactly three files, and every one was **outbound**: `cursor-dispatch.mjs` opens an issue to
wake a Cursor cloud agent, and `cursor/runtime.mjs` probes for that capability. There was **no
code path anywhere that read GitHub issues into the control plane.** A P0 could sit in the
shared repo indefinitely and no local agent would see it, because nothing was looking.

**2. The credential is absent.** `gh` is installed (v2.92.0) but `gh auth status` reports *not
logged into any GitHub hosts*. Even with a bridge, the read would fail.

Fixing only one of these would have produced a bridge that silently returned "no issues."

## What was built

`AI-HANDOFF/bridge/github-ingest.mjs` — deterministic, no LLM, read-only against GitHub.

- **Untrusted input.** An issue is data, never instruction. Bodies are screened through the
  existing `screenUntrusted`, and **the body is never copied into the objective** — an agent
  reads the issue at source.
- **Fail-closed routing.** No severity label ⇒ P2/tier 3. Ambiguous or absent owner ⇒ unrouted
  and `approval_required`. An issue can never mint an autonomous high-risk task for itself.
- **Honest health.** No auth, no binary, or a failed read ⇒ `BLOCKED` with the owner action —
  never `OK` on a read that did not happen.
- **Idempotent.** A ledger keyed on `GH-<number>`; a pre-existing task is recorded, never
  overwritten.

`~/Library/LaunchAgents/com.partyperfect.github-bridge.plist` — 300 s poll. A remote issue
produces no local filesystem event, so `WatchPaths` cannot apply here; a low-frequency poll of
the `gh` CLI is the correct trigger and invokes no paid runtime.

**Verified running:** `launchctl kickstart` produced a live run at `18:54:09Z`, wrote stdout,
updated `bridge-health.json`, and exited **1** — correctly reporting BLOCKED rather than success.

## Defects found and fixed along the way

**In the security gateway** (found by building the bridge): `security-gateway.mjs` executed its
CLI **at import time**, so any importing module inherited its argv handling *including
`process.exit`*. `github-ingest.mjs --test` ran the *gateway's* tests and exited before its own
started. A policy engine must be importable without side effects. Now guarded on `IS_MAIN`.

**In the bridge** (found by Codex, first verification pass — all four legitimate):

| Codex finding | Fix | Regression test |
|---|---|---|
| `title-injection-forwarded` — screened title still copied verbatim into the agent-consumed objective | `safeTitle()`: a title that screens dirty is withheld entirely, not reproduced | "injection-shaped TITLE is not reproduced in the objective" |
| `label-order-demotion` — labels spread last-wins, so `[p0,p2]` and `[p2,p0]` produced different tiers | severity is now a **max over labels**, order-independent | "conflicting severity labels are order-independent" |
| `ingest-failure-reports-ok` — a task that failed to be created was filed under `skipped` while health still said `OK` | separate `failed` bucket; health degrades to `DEGRADED` | — |
| `regression-evidence-incomplete` — the gateway and Sentinel suites append inside the repo, so a read-only verifier could not run them and could only count assertions statically | all three suites take path overrides; `run-suites.sh` redirects them to a scratch dir | harness asserts the redirection actually held |

## Reproducing the suites — independently

```
bash AI-HANDOFF/run-suites.sh
```

24 bridge + 14 gateway + 25 sentinel assertions, all passing, **with zero writes into the
repository** (confirmed by `git status` before and after). This exists so the verifier can
re-derive the numbers rather than accept the owner's count.

## Verification status — NOT CERTIFIED

Codex verified twice and never certified:

1. **NEEDS_FIX** — the four findings above. All fixed, each with a named regression test.
2. **BLOCKED** — "sandbox restrictions prevent independently executing those required
   mutation-based suites." That is what `run-suites.sh` addresses.
3. **A third pass was refused by the governor:** `BLOCKED_RETRY_LIMIT: 2 attempts exceeds
   max_retries 1`.

**That ceiling was not raised.** It is the cost guard added after the 2026-08-12 unauthorized
paid-compute incident (`AI-HANDOFF/governor/POLICY.json`, `limits.max_retries`), and quietly
raising a safety limit to obtain a green verdict is precisely the behaviour it exists to
prevent. Raising it is Mason's decision.

**So: the fixes are implemented and self-tested, and they are NOT independently certified.**

## Known limitation

End-to-end ingestion of a real GitHub issue is **unproven**. `gh` is unauthenticated, so the
read path has never returned real data. Everything below the read is tested; the read itself
is not. The bridge reports this as `BLOCKED`, not as an empty success.
