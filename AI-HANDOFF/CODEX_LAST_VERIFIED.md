# Codex — Last Verified

**Generated:** 2026-08-17T14:24:11.812Z · **Health:** RED · **Confidence:** low

> Maintained automatically by the Codex verifier worker. Do not hand-edit.

## System health

| | |
|---|---|
| SYSTEM HEALTH | **RED** |
| OPEN P0 | 6 |
| OPEN P1 | 41 |
| CLAUDE TASKS | 16 |
| CURSOR TASKS | 26 |
| CODEX VERIFYING | 0 |
| AWAITING VERIFICATION | 0 |
| BLOCKED ON MASON | 5 |

## Open findings

- **P0 · false-green-codex-access-smoke-001** (CODEX-SWEEP-DAILY) — CODEX-ACCESS-SMOKE-001 is CERTIFIED_PASS but no verification exists in the ledger
- **P0 · false-green-codex-access-smoke-001** (CODEX-SWEEP-WEEKLY) — CODEX-ACCESS-SMOKE-001 is CERTIFIED_PASS but no verification exists in the ledger
- **P0 · secret-in-tracked-file-ai-handoff-governor-test-accounting-mjs** (CODEX-SWEEP-WEEKLY) — Possible secret committed in AI-HANDOFF/governor/test-accounting.mjs
- **P0 · secret-in-tracked-file-ai-handoff-sentinel-test-sentinel-mjs** (CODEX-SWEEP-WEEKLY) — Possible secret committed in AI-HANDOFF/sentinel/test-sentinel.mjs
- **P0 · secret-in-tracked-file-scripts-foundation-foundation-test-mjs** (CODEX-SWEEP-WEEKLY) — Possible secret committed in scripts/foundation/foundation.test.mjs
- **P0 · secret-in-tracked-file-scripts-test-ai-cost-ts** (CODEX-SWEEP-WEEKLY) — Possible secret committed in scripts/test-ai-cost.ts
- **P1 · missing-evidence-artifact** (CONTROL-PLANE-CURSOR-SMOKE-001) — Cursor did not produce the required artifact
- **P1 · collector-action-boundary-collapse** (SENTINEL-PHASE1-REVIEW-001) — AI input screening uses `sentinel.action.quarantine_artifact` both to read signals and quarantine artifacts, combining collection with broker capability; there are only seven unique named identities across eight sections because agent health and cost share a scope.
- **P1 · pii-secret-redaction-gaps** (SENTINEL-PHASE1-REVIEW-001) — SENSITIVE_PII and secrets are not demonstrably unreachable: unrestricted header values, actor identity, replication error strings, and artifact references lack mandatory sanitization and could carry cookies, personal identifiers, credentials, or source text.
- **P1 · containment-properties-unspecified** (SENTINEL-PHASE1-REVIEW-001) — Auto actions are not defined with enforceable scope, reversal, TTL, and idempotency semantics; rate limits, task pauses, retry stops, snapshot trust changes, notifications, and quarantines lack one or more required properties.
- **P1 · identity-isolation-unproven** (SENTINEL-PHASE1-REVIEW-001) — Analyst-to-collector and analyst-to-broker isolation is asserted but no identity inventory, ACL, process boundary, broker authorization protocol, or runtime evidence establishes it; the analyst also directly emits proposals toward the broker.
- **P1 · healthy-not-evidence-gated** (SENTINEL-PHASE1-REVIEW-001) — The HEALTHY state has no required evidence source, freshness threshold, transition rule, or fail-closed behavior when watchdog evidence is absent, so the document does not prevent an unsupported HEALTHY report.
- **P1 · matter-separation-only-asserted** (SENTINEL-PHASE1-REVIEW-001) — No process/account/key/token/write-role/queue/release-approval/health-monitor sharing is asserted but not confirmed by inventories, deployment definitions, credential bindings, queue ACLs, or runtime evidence.
- **P1 · title-injection-forwarded** (GH-BRIDGE-001) — Injection screening includes the issue title, but the unsanitized title is still copied into the agent-consumed objective, contradicting quarantine guarantees.
- **P1 · label-order-demotion** (GH-BRIDGE-001) — Routing applies labels sequentially with last-label-wins semantics, so conflicting labels such as p0 and p2 produce different risk tiers depending on GitHub label order instead of failing closed.
- **P1 · ingest-failure-reports-ok** (GH-BRIDGE-001) — A control-plane task creation failure is placed in skipped, but the final bridge health still reports state OK and READ_SUCCEEDED.
- **P1 · required-auth-gate-bypassed** (SEC-HEALTH-PII-001) — The full operational inventory is gated only by readSession(), not requireApiAuth as required by the objective.
- **P1 · manager-http-case-unproven** (SEC-GATEWAY-WIRE-001) — No HTTP session can map to MANAGER; the cited test calls matterHttpGate directly, so it does not prove that a MANAGER-role session is refused por-write by requireApiAuth.
- **P1 · mutation-policy-not-mapped** (SEC-GATEWAY-WIRE-001) — requireApiAuth maps each permission to a fixed read action, and no application mapping uses por-write, so mutating HTTP operations are not classified by their actual action/resource risk.
- **P1 · gateway-engine-drift** (SEC-GATEWAY-WIRE-001) — The HTTP boundary does not use the stated security-gateway engine; it uses a divergent TypeScript copy where inventory-read is tier 1 instead of tier 2 and role/agent policies differ materially.
- **P1 · signal-id-data-leak** (SENTINEL-APP-001) — Collector-supplied signalIds are accepted as arbitrary strings, bypass text redaction, returned by APIs, and displayed in the owner drilldown, so secrets or PII can leak despite the counts-only claim.
- **P1 · lease-callback-not-fenced** (TALK-TO-MIKE-INTAKE-001) — ACK/FAIL operations are not tied to a lease attempt: ACK retains lease_owner, so a delayed or subsequent FAIL can move a DELIVERED command back to QUEUED, while callbacks from an expired lease can mutate a newer lease owned by the same fixed worker identity.
- **P1 · bridge-still-not-integrated** (EOD-SAFETY-CHECKPOINT-001) — The existing iMessage bridge never imports or calls handleBridgeMessage(); the evidence contains only unapplied patch instructions, so an authorized iMessage cannot trigger the checkpoint.
- **P1 · synchronize-not-performed** (EOD-SAFETY-CHECKPOINT-001) — The SYNCHRONIZING phase merely reads Git status and records counts; it does not synchronize or durably save agent state.
- **P1 · backup-not-performed** (EOD-SAFETY-CHECKPOINT-001) — The BACKING_UP phase only verifies a pre-existing destination and performs no backup operation, so the claimed BACK UP step is absent.
- **P1 · acceptance-crash-can-resend** (MIKE-TASK-NOTIFY-001) — If the provider accepts but the process dies before send resolves or PROVIDER_ACCEPTED is appended, recovery sees only PENDING and sends the notification again.
- **P1 · live-bridge-not-wired** (MIKE-BRAIN-ROUTING-001) — The live bridge still calls the canned v0 mikeReply stub; it never imports or invokes routeMessage.
- **P1 · execution-chain-missing** (MIKE-BRAIN-ROUTING-001) — Routing only creates and binds a task; no implementation connects task creation to an accounting agent or invokes reportResult after verified work.
- **P1 · acceptance-still-failed** (MIKE-BRAIN-ROUTING-001) — The supplied acceptance record remains FAILED and explicitly says an acknowledgement is insufficient; no live rerun proves an actual QuickBooks result reached Mason.
- **P1 · unrepaired-sec-health-pii-001** (CODEX-SWEEP-DAILY) — SEC-HEALTH-PII-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sec-gateway-wire-001** (CODEX-SWEEP-DAILY) — SEC-GATEWAY-WIRE-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sentinel-phase1-review-001** (CODEX-SWEEP-DAILY) — SENTINEL-PHASE1-REVIEW-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sentinel-app-001** (CODEX-SWEEP-DAILY) — SENTINEL-APP-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-eod-safety-checkpoint-001** (CODEX-SWEEP-DAILY) — EOD-SAFETY-CHECKPOINT-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-mike-task-notify-001** (CODEX-SWEEP-DAILY) — MIKE-TASK-NOTIFY-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-mike-brain-routing-001** (CODEX-SWEEP-DAILY) — MIKE-BRAIN-ROUTING-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unmerged-branch** (CODEX-SWEEP-DAILY) — 46 commit(s) on 'agent/cursor/PP-TIME-001' not in main — fixes are written but not deployed
- **P1 · codex-worker-silent** (CODEX-SWEEP-DAILY) — Codex has not heartbeat in 4d
- **P1 · unrepaired-sec-health-pii-001** (CODEX-SWEEP-WEEKLY) — SEC-HEALTH-PII-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sec-gateway-wire-001** (CODEX-SWEEP-WEEKLY) — SEC-GATEWAY-WIRE-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sentinel-phase1-review-001** (CODEX-SWEEP-WEEKLY) — SENTINEL-PHASE1-REVIEW-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-sentinel-app-001** (CODEX-SWEEP-WEEKLY) — SENTINEL-APP-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-eod-safety-checkpoint-001** (CODEX-SWEEP-WEEKLY) — EOD-SAFETY-CHECKPOINT-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-mike-task-notify-001** (CODEX-SWEEP-WEEKLY) — MIKE-TASK-NOTIFY-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unrepaired-mike-brain-routing-001** (CODEX-SWEEP-WEEKLY) — MIKE-BRAIN-ROUTING-001 has been NEEDS_FIX for 4d with no repair
- **P1 · unmerged-branch** (CODEX-SWEEP-WEEKLY) — 46 commit(s) on 'agent/cursor/PP-TIME-001' not in main — fixes are written but not deployed
- **P1 · codex-worker-silent** (CODEX-SWEEP-WEEKLY) — Codex has not heartbeat in 4d

## Needs Mason

- **POR-STAT-VERIFY-001** — Verify POR Transactions.STAT 2-char (primary+secondary) decoding against raw SSD lookups · _BLOCKED_COMPUTE_NOT_APPROVED: POR-STAT-VERIFY-001 has no compute approval_
- **POR-KITS-VERIFY-001** — Verify POR kit semantics (ItemKits: parent Num -> component ItemKey x Quantity) against raw SSD · _BLOCKED_COMPUTE_NOT_APPROVED: POR-KITS-VERIFY-001 has no compute approval_
- **CERT-HARNESS-VERIFY-001** — Codex adversarially audits the certification harness (find any false CERTIFIED_PASS path) · _BLOCKED_COMPUTE_NOT_APPROVED: CERT-HARNESS-VERIFY-001 has no compute approval_
- **CONTROL-PLANE-CURSOR-SMOKE-001** — Smoke: prove Cursor autonomy end to end. Produce the required evidence artifact. · _BLOCKED_COMPUTE_NOT_APPROVED: CONTROL-PLANE-CURSOR-SMOKE-001 has no compute approval_
- **PP-SEC-001** — Certify PP-SEC-001 API authorization lockdown on production partyperfect.app · _BLOCKED_COMPUTE_NOT_APPROVED: PP-SEC-001 has no compute approval_

## Recent verifications

| when | task | verdict | worker |
|---|---|---|---|
| 2026-08-13T22:04:37.604Z | MIKE-BRAIN-ROUTING-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:55:27.767Z | MIKE-TASK-NOTIFY-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:52:34.538Z | MIKE-TASK-NOTIFY-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:46:42.303Z | MIKE-TASK-NOTIFY-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:35:37.469Z | EOD-SAFETY-CHECKPOINT-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:31:53.724Z | EOD-SAFETY-CHECKPOINT-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-13T21:19:42.852Z | TALK-TO-MIKE-INTAKE-001 | **BLOCKED** | codex-cloud |
| 2026-08-13T20:26:14.060Z | TALK-TO-MIKE-INTAKE-001 | **NEEDS_FIX** | codex-cloud |
