# Matter provider-neutral orchestration — audit + V1 vertical slice

**Date:** 2026-08-15 · **Policy:** `1.0.0+027e1c37c161` · **Auditor:** Claude (claude-code)
**Instruction followed:** §16 — audit first, claim nothing that does not exist, then build the smallest real slice.

## The headline finding

Party Perfect already had a real deterministic control plane and a real Matter orchestrator — but
**both encoded the exact anti-pattern this policy prohibits.** Routing was by *provider name*, not capability:

| Where | The hard-coded assignment |
|---|---|
| `control-plane.mjs:26-31` | `SUBSYSTEM_OWNER = { por:"claude", … product:"cursor", … audit:"codex", … }` |
| `matter/orchestrate.mjs:57-59` | `WORKERS = { cursor:{handles: t.owner_agent==="cursor"}, codex:{…verifier_agent==="codex"} }` |
| `matter/orchestrate.mjs:204` | `dispatchParallel(["cursor","codex"])` |
| `matter/orchestrate.mjs:164-166` | board prints fixed `CLAUDE / CURSOR / CODEX` rows |

That is literally *"Cursor always codes, Codex always verifies, Claude always handles operations."*
**I built part of that myself earlier in this session** (the `SUBSYSTEM_OWNER` extension), so this
finding is against my own prior work, not only inherited code.

## Audit matrix

| Component | Current state | Verdict | Evidence | Gap | Owner | Plan |
|---|---|---|---|---|---|---|
| Matter durable tasks | `MASTER_STATE.json` (42 tasks) + append-only `TASK_QUEUE.jsonl` | **REAL** | task history survives restarts; used all session | task record has no `worker/model/version` or `required_capabilities` | Matter | extend task schema (V2) |
| Worker registry | `runtime/WORKERS.json`, 6 entries | **PARTIAL** | fields are ops-only: `role/launch/detect/status` | no capabilities, no versions, hard-coded `status:"ACTIVE"`/`"NOT_INSTALLED"` | Matter | **DONE V1** → `WORKER_REGISTRY.json` |
| Capability registry | `AI_PROVIDER_USAGE_CAPABILITIES.md` (prose, cost-only) | **MISSING** | markdown table about billing, not machine-readable capability | nothing routable | Matter | **DONE V1** |
| Capability heartbeat | `HEARTBEATS.json` `{current_task,state,last_seen}` | **PARTIAL** | real but liveness-only | no version/capabilities/tools/limitations | Matter | **DONE V1** |
| Policy broadcast | — | **MISSING** | no policy artifact existed | — | Matter | **DONE V1** (`MATTER_POLICY.json`, content-addressed version) |
| Policy acknowledgement | — | **MISSING** | — | — | Matter | **DONE V1** (`POLICY_ACKS.jsonl`, real acks) |
| Dynamic routing | name-based maps above | **MISSING (anti-pattern present)** | see headline table | provider ≠ replaceable | Matter | **DONE V1** (capability router) |
| Fallback routing | retry + `detect` probe in `local-dispatcher.mjs` | **PARTIAL** | probes before launching | no "next qualified worker" evaluation | Matter | **DONE V1** (ranked eligible list) |
| Provider update watcher | — | **MISSING** | — | Mason tracks releases manually | Matter | V2 (scheduled Capability Watch) |
| Internal benchmarking | — | **MISSING** | — | capabilities are declared, never measured | Matter | V2 (benchmark → `source:"measured"`) |
| Task performance history | `TASK_QUEUE.jsonl` / `RESULTS.jsonl` | **PARTIAL** | full event history exists | no per-worker aggregation | Matter | **DONE V1** (`WORKER_OUTCOMES.jsonl` + `scoreFor`) |
| Builder ≠ verifier | `control-plane.mjs` `SELF-CERTIFY BLOCKED` (2 sites) | **REAL** | enforced + tested this session | applied per-task, not at selection time | control plane | **V1 adds selection-time separation** |
| Startup sync | — | **MISSING** | workers start from stale prompts | — | Matter | V2 (`sync` command; V1 gives policy+registry to read) |
| End-of-work sync | evidence files + `RESULTS.jsonl` | **PARTIAL** | evidence captured | no structured report contract | Matter | **DONE V1** (`report` with fixed fields) |
| Mike integration | `mike-brain/`, `mike-notify/` | **REAL (blocked)** | routes iMessage → Matter task | live-answer path fixed on `claude/mike-live-answer-001`, unmerged/unarmed | Matter | merge + arm (Mason) |
| Madison integration | — | **MISSING** | no `madison/` anywhere | stable agent has no worker binding | Matter | V2 |
| Cursor integration | `cursor-agent` 2026.08.11, authenticated | **REAL** | ran autonomously in isolated worktree this session; acked V1 policy itself | — | Matter | — |
| Claude integration | claude-code 2.1.229 | **REAL** | this session; acked V1 policy | — | Matter | — |
| Codex integration | **codex-cli 0.147.0, logged in via ChatGPT** | **REAL (new)** | probe passed at 00:4x; `codex exec` ran the ack itself | `runtime/WORKERS.json` still says `NOT_INSTALLED` — **stale** | Matter | reconcile old registry |
| Grok integration | — | **MISSING** | no reference in the plane | — | Matter | V2 (register when a runtime exists) |
| Claw integration | — | **MISSING** | no reference in the plane | — | Matter | V2 |
| Command Center owner view | `app/matter` route + `DASHBOARD.md` | **PARTIAL** | pages exist | no worker/capability/policy view | Cursor | handoff (below) |

### A stale hard-coded status, caught by a live probe
`runtime/WORKERS.json` declares `codex-local: NOT_INSTALLED`. That was true earlier today and is
**false now** — `codex-cli 0.147.0` is installed and logged in. The V1 registry found this because
availability is probed, never asserted. This is precisely the failure mode the policy targets.

## V1 vertical slice — what was actually built

`AI-HANDOFF/matter/matter-registry.mjs` (+ `MATTER_POLICY.json`, `test-matter-registry.mjs`).
Additive: **no existing file was modified**, so the control plane and `orchestrate.mjs` keep working.

POLICY BROADCAST → WORKER ACK → CAPABILITY HEARTBEAT → REGISTRY → DYNAMIC ROUTING → REPORT → VERIFICATION → DURABLE AUDIT

- **Policy version is content-addressed** (`semver+sha256[12]`) — editing the policy mints a new version, so a stale ack cannot silently pass.
- **Availability is probed**, never asserted (`probe` runs the worker's real `detect` command).
- **Routing is capability-based.** Test 17 scans this file's own source and fails if any provider name (`cursor`, `codex`, `claude`, `grok`, `claw`, `chatgpt`, `openai`) appears in routing logic. A new provider becomes eligible by registering — no code change (test 7).
- **Builder ≠ verifier at selection time**; when no independent verifier exists the task is **BLOCKED**, never auto-certified (test 11).
- **No fake precision:** a worker score stays `null` until `min_samples_for_score` (5) real outcomes exist; the board prints `n/a(n)`. A worker's own "complete" claim is recorded as `reported_complete` and **does not** raise its score (tests 14–15).
- **Every routing decision is durably audited** with each candidate and the reason it was rejected, plus `selection_basis` stating whether the winner had a proven score or was a latency tie-break.

### Real-state proof (not simulated)

| Step | Evidence |
|---|---|
| Real probes | `claude-code AVAILABLE (903ms)` · `cursor-local AVAILABLE (529ms)` · `codex-local AVAILABLE (101ms)` |
| Stale path caught | pinned claude `2.1.222` probe **failed**; corrected to version-independent binary |
| Real heartbeats | versions read from the binaries: `codex-cli 0.147.0`, cursor `2026.08.11-e8db854` |
| **Genuine acks (3/3)** | claude-code self-ack; **`codex exec` ran its own ack**; **`cursor-agent` ran its own ack** — no simulated acknowledgements |
| Dynamic routing | coding task → eligible `claude-code, cursor-local`; `codex-local` rejected: *missing capability 'local_execution'* |
| Verification separation | POR-risk task → primary `codex-local`, verifier `claude-code` (different workers) |
| Safety gate | POR write declaring `por_write` → **BLOCKED**, all three workers *"lacks permission 'por_write'"* |
| Tests | 17/17 hermetic (`node test-matter-registry.mjs`), scratch dir, writes nothing real |

## Known limitations (stated, not hidden)

1. **All capabilities are `declared`, none `measured`.** No benchmark exists yet, so levels are self-asserted. The board marks measured ones with `*`; today there are none.
2. **Scores are `n/a`** — 1 real outcome recorded. Routing among unproven workers is a latency tie-break, and says so.
3. **Old registry not yet reconciled.** `runtime/WORKERS.json` and `orchestrate.mjs` still carry name-based routing; V1 runs alongside them rather than replacing them (deliberate — replacing live dispatch needs its own verified change).
4. **Not wired into task execution.** V1 selects and audits; `orchestrate.mjs` still dispatches by name. Cutover is V2 and should be verified independently.
5. **Grok / Claw / Madison unregistered** — no runtime present to probe.
6. **Nothing here is armed or deployed.** No production change, no POR write, no money, no credentials.

## Cursor handoff (Command Center — Cursor-owned code, not modified)

Add an owner view at `app/matter` reading these files (no new API needed; all are local JSON/JSONL):

| File | Renders |
|---|---|
| `AI-HANDOFF/matter/WORKER_REGISTRY.json` | Workers online/offline, provider, version, capabilities, last heartbeat, policy-ack state |
| `AI-HANDOFF/matter/MATTER_POLICY.json` | Current policy version |
| `AI-HANDOFF/matter/POLICY_ACKS.jsonl` | Acknowledgement status per worker |
| `AI-HANDOFF/matter/ROUTING_DECISIONS.jsonl` | Routing decisions, blocked tasks, `CAPABILITY_CHANGE_DETECTED` events |
| `AI-HANDOFF/matter/WORKER_OUTCOMES.jsonl` | Outcome history; show `n/a(n)` when samples < 5 — **never invent a score** |

Acceptance: the page must show a worker as offline when its probe fails, and must never display a
score that `scoreFor()` returns as `null`.

## Next (V2), in priority order

1. Reconcile `runtime/WORKERS.json` + `orchestrate.mjs` onto the capability router (cutover, independently verified).
2. Benchmark harness → flip capabilities from `declared` to `measured`.
3. Scheduled Capability Watch (§4) so Mason stops tracking vendor releases.
4. Startup-sync command workers must call before working (§9).
5. Register Madison / Grok / Claw when runtimes exist.
