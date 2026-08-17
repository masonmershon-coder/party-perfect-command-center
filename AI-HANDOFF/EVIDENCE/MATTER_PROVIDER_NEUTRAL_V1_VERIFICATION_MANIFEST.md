# MATTER PROVIDER-NEUTRAL V1 — VERIFICATION MANIFEST

Prepared for independent Codex re-verification after `NOT_READY_FOR_V2_CUTOVER`
(reason: *verification evidence and source unavailable*).

**This was an access/evidence pass only. The candidate was NOT modified.**
No code remediation, no test rewriting, no merge, no deploy, no legacy cutover.

```
REPOSITORY                    = /Users/mikeai/grok-dashboard
REPOSITORY_REMOTE             = https://github.com/masonmershon-coder/party-perfect-command-center.git
BRANCH                        = claude/matter-provider-neutral-v1
FULL_CANDIDATE_SHA            = 51c362cb1187d3459d103bd2768767ef3934612e
BASE_SHA                      = 262d40924823db9440dc95403b3d468333b60e17
TREE_SHA                      = 80e84cbb70a13a255f6a51e4095d9d927be57045
COMMIT_DATE                   = 2026-08-15T00:40:04-05:00
BUNDLE_PATH                   = AI-HANDOFF/EVIDENCE/matter-v1/matter-v1-candidate-51c362cb1187.bundle
BUNDLE_SHA256                 = 48e56a7e37b78cc16457a348134615a1a350c5405b5c8d4f084377288173208e
BUNDLE_SIZE                   = 2.0M  (complete history, directly clonable)
TEST_COMMAND                  = MATTER_DIR=$(mktemp -d) node test-matter-registry.mjs
TEST_CWD                      = <checkout>/AI-HANDOFF/matter
TEST_RUNTIME                  = node v22.22.2 · Darwin 25.4.0 arm64 · no network required
TEST_RESULT                   = 17 passed, 0 failed (exit 0) — reproduced from clean checkout AND from a standalone bundle clone
POLICY_VERSION                = 1.0.0+027e1c37c161
POLICY_HASH                   = 027e1c37c161  (sha256(JSON.stringify(MATTER_POLICY.json))[0:12])
WORKERS_ACKED                 = 3 with execution transcripts (claude-code, codex-local, cursor-local); 5 further ack rows written by a collaborator batch script — NOT worker-executed (see limitations)
HEARTBEATS_CAPTURED           = 5 probed (claude-code, cursor-local, codex-local, grok-local available; claw-local UNAVAILABLE)
ROUTING_EVIDENCE_PATH         = AI-HANDOFF/EVIDENCE/matter-v1/06_routing_evidence.txt (+ 06_routing_decisions_raw.jsonl)
DURABILITY_EVIDENCE_PATH      = AI-HANDOFF/EVIDENCE/matter-v1/08_durability.md
LEGACY_ROUTING_EVIDENCE_PATH  = AI-HANDOFF/EVIDENCE/matter-v1/09_legacy_routing.txt
WORKTREE_CLEAN                = NO — repo working tree is dirty (84 changes) and checked out on another agent's branch (agent/cursor/PP-TIME-001). Verification binds to the immutable commit, not the working tree. The clean checkout and bundle clone were both 0-change.
UNCOMMITTED_COLLABORATOR_FILES = BUSINESS_AGENTS.json (sha256 9644df0d…), bootstrap-workers.mjs (sha256 9392a6ec…), worker-sync.mjs (sha256 5e04a421…) — untracked, NOT in the candidate, snapshotted read-only under 02_collaborator_inflight/
```

## Evidence index — `AI-HANDOFF/EVIDENCE/matter-v1/`

| § | File | Contents |
|---|---|---|
| 1 | `01_candidate_identity.txt` | repo, remote, branch, full SHAs, per-file git blob ids, worktree state |
| 1 | `01_candidate_diff.patch` | exact `base..candidate` diff (45,798 bytes, 4 files, +745) |
| 2 | `02_collaborator_inflight/` | the 3 in-flight collaborator files + `STATE.txt` (git state, sha256, mtime, bytes) |
| 2 | `02_legacy_sources/` | `control-plane.mjs`, `orchestrate.mjs` **as of the candidate commit** |
| 3 | `03_test_rerun.txt` | exact command, runtime, env, complete output from clean checkout |
| 4 | `04_ack_evidence.md` | ack evidence + explicit authentication limitation |
| 5 | `05_heartbeat_evidence.md` | probes, versions, DECLARED vs MEASURED, staleness behaviour |
| 6 | `06_routing_evidence.txt` | routing cases A–F with eligible/rejected/reasons/selection basis |
| 6 | `06_routing_decisions_raw.jsonl` | raw audit rows for those decisions |
| 7 | `07_scoring_evidence.txt` | min-sample rule, self-report cannot inflate score |
| 8 | `08_durability.md` | per-store durability labels |
| 9 | `09_legacy_routing.txt` | proof legacy provider-specific dispatch remains |
| 10 | `10_live_state_snapshot/` | live append-only logs + registry snapshot |
| 11 | `11_bundle_independent_verification.txt` | clone-from-bundle → exact SHA → 17/17 |

## §6 routing results (summary — full output in the evidence file)

| Case | Requirement | Selected | Result |
|---|---|---|---|
| A | coding ≥0.8 + local_execution | `claude-code` | codex rejected: *missing capability 'local_execution'* |
| B | coding ≥0.8, risk_class security | primary `codex-local`, verifier `claude-code` | builder ≠ verifier |
| C | coding ≥0.95 + local_execution | `synthetic-vendor-x` | **unknown provider won on capability**; all three real workers rejected by level |
| D | coding ≥0.99, best worker offline | `synthetic-vendor-x` | `preferred-but-offline` rejected: *not available (probe failed)* |
| E | permission `production_deploy` | **NONE** | all 5 rejected: *lacks permission* → `blocked: true` |
| F | POR write + permission `por_write` | **NONE** | all 5 rejected: *lacks permission 'por_write'* → `blocked: true`, `owner_approval_required: true` |

**F remained BLOCKED**, as required.

## KNOWN_LIMITATIONS (stated plainly — several are self-reported findings)

1. **Ack authenticity is NOT cryptographic.** `ack <worker_id>` is an unauthenticated local CLI
   call writing to an editable JSONL. It proves an ack was *recorded*, not that the named worker
   *performed* it. Three acks have execution transcripts; **five rows written at 05:40:40Z by a
   collaborator's batch script are not worker-executed**, and two of those (`grok-local`,
   `claw-local`) name workers that never ran — `claw-local` is `available:false` and could not
   have. Recommend authenticated acks as a **V2 blocker**.
2. **All capability levels are DECLARED, none MEASURED** (live count: declared 19, measured 0).
   Routing is currently driven by numbers workers assert about themselves.
3. **Storage is FILE-BACKED, not durable.** Registry and policy are MUTABLE whole-file rewrites
   with no atomicity, no locking, no fsync. Probe/heartbeat values are overwritten with no
   history. Only `POLICY_ACKS.jsonl`, `ROUTING_DECISIONS.jsonl`, `WORKER_OUTCOMES.jsonl` are
   append-only. A concurrent agent demonstrably rewrote the live registry during this evidence
   pass (§8).
4. **Legacy dispatch is unchanged and still provider-specific** — `SUBSYSTEM_OWNER`,
   `WORKERS = {cursor, codex}`, `dispatchParallel(["cursor","codex"])`, fixed board rows.
   V1 is a **selection layer only**; it does not dispatch. V2 cutover NOT done.
5. **Cosmetic defect (case F):** with `primary = NONE`, the decision still names a `verifier`
   (`claude-code`). `blocked:true` is correct and safety is unaffected, but a verifier should not
   be populated when no primary exists. Reported, **not fixed**, per the no-remediation instruction.
6. **Scores are effectively unused** — 1–2 real outcomes exist; ranking among unproven workers is
   a probe-latency tie-break, which `selection_basis` states on every decision.
7. **`claude-code` self-ack is the weakest of the three** — the agent authoring this bundle is
   also the actor for that row.
8. Working tree is dirty and on another agent's branch; only the commit/bundle are authoritative.

## How Codex can verify from scratch

```bash
git clone --branch claude/matter-provider-neutral-v1 \
  <BUNDLE_PATH> /tmp/matter-verify
cd /tmp/matter-verify
git rev-parse HEAD          # must equal 51c362cb1187d3459d103bd2768767ef3934612e
cd AI-HANDOFF/matter
MATTER_DIR=$(mktemp -d) node test-matter-registry.mjs   # expect 17 passed, 0 failed
```

Already performed and recorded in `11_bundle_independent_verification.txt`.

## STATUS

**READY_FOR_CODEX_REVERIFY** — subject to Mason's decision on delivery (below).

Delivery option **C (self-contained bundle)** is complete and proven.
Delivery option **A (push to GitHub)** is *prepared but NOT executed*: the remote is a shared
repository, and pushing a branch is an outward-facing action requiring Mason's authorization
(§10 stop condition). No push, no merge, no deploy has been performed.
