# MATTER — Provider-Neutral Autonomous Orchestration V1 · Audit Matrix

**Date:** 2026-08-15  
**Auditor:** Cursor  
**Policy:** `AI-HANDOFF/matter/MATTER_POLICY.json` (`MATTER_PROVIDER_NEUTRAL_ORCHESTRATION` 1.0.0)  
**Principle:** Stable Matter · Stable business agents · Replaceable intelligence · Dynamic routing · Durable memory · Verified work · Owner control

Do **not** claim the full architecture already existed. This matrix is the pre-implementation truth, then the V1 vertical slice that landed.

---

## Audit matrix

| COMPONENT | CURRENT STATE | REAL / PARTIAL / MISSING | EVIDENCE | GAP | OWNER | IMPLEMENTATION PLAN |
|---|---|---|---|---|---|---|
| Matter durable tasks | File control-plane `MASTER_STATE.json` + Matter events | **PARTIAL** | `AI-HANDOFF/MASTER_STATE.json`, `MATTER_EVENTS.jsonl`, `control-plane.mjs` | Separate universes: file Matter vs `ai_core.tasks` vs CC Grok tasks; not yet one Universal Matter Task schema end-to-end | Matter / Claude+Cursor | Unify task envelope over time; V1 routes via capability router + audits decisions |
| Worker registry | Capability registry in Matter dir | **REAL (V1)** | `AI-HANDOFF/matter/WORKER_REGISTRY.json`, `matter-registry.mjs` | Older `runtime/WORKERS.json` still role-hardcoded | Cursor | Prefer `WORKER_REGISTRY.json`; deprecate role→provider maps |
| Capability registry | Capabilities map on each worker | **REAL (V1)** | Same registry; `source: declared\|measured` | No measured benchmarks yet | Cursor | Keep declared vs measured; only measured moves weight |
| Heartbeats | Capability heartbeat + probe | **REAL (V1)** | `heartbeat()`, `probe()`, `last_heartbeat` / `available` | Legacy `HEARTBEATS.json` is task-state, not capability | Cursor | Use Matter registry heartbeats for routing |
| Policy broadcast | `MATTER_POLICY.json` + content-hash version | **REAL (V1)** | `policy()` → `semver+hash` | No push channel beyond files | Cursor | Workers sync on startup (`worker-sync.mjs`) |
| Policy acknowledgement | Append-only acks | **REAL (V1)** | `POLICY_ACKS.jsonl`, `ack()` | Workers must call sync; stale workers blocked on sensitive work | All workers | Startup rule: sync before sensitive tasks |
| Dynamic routing | Capability router | **REAL (V1)** | `route()` in `matter-registry.mjs`; `ROUTING_DECISIONS.jsonl` | Not yet the only dispatcher (`orchestrate.mjs` still role-based) | Cursor | Bridge orchestrate → registry route over next cycle |
| Fallback routing | Ranked eligible list | **PARTIAL** | Router picks next eligible by score/latency; offline excluded with reasons | No automatic re-dispatch loop on mid-task failure yet | Cursor | Add retry/fallback executor after durable task unify |
| Provider update watcher | CLI version watch | **PARTIAL (V1)** | `capability-watch.mjs` → `CAPABILITY_WATCH.jsonl` | No vendor release-note scrapers; know≠apply enforced | Cursor | Extend watchers later; never auto-install |
| Internal benchmarking | Declared vs measured | **MISSING** | Policy forbids fake precision; scores null until samples | No PP benchmark suite yet | Claude+Cursor | Add measured capability tests before weight changes |
| Task performance history | Outcomes ledger | **REAL (V1)** | `WORKER_OUTCOMES.jsonl`, `report()`, `scoreFor()` | Thin sample set | All workers | End-of-work reports mandatory |
| Builder ≠ verifier | Enforced on risk classes | **REAL (V1)** | Router + tests 10–11 | Must be wired into production dispatch | Cursor | Require route() before high-risk launch |
| Startup sync | Scripted | **REAL (V1)** | `worker-sync.mjs` | Not yet hooked into every agent entrypoint | All workers | Document + call from each worker start |
| End-of-work sync | Report API | **REAL (V1)** | `report()` | Not yet universal across agents | All workers | Require report before task close |
| Mike integration | Business agent record | **PARTIAL** | `BUSINESS_AGENTS.json` mike; intake APIs exist separately | Mike runtime not yet routed via Matter registry | Claude / Cursor | Route Mike work by capability |
| Madison integration | Business agent record | **PARTIAL** | `BUSINESS_AGENTS.json` madison | Design/marketing still CC-path specific | Cursor | Same as Mike |
| Cursor integration | Worker `cursor-local` | **PARTIAL→REAL probe** | Registry + Cursor owns CC codebase | Must ack policy each session | Cursor | `worker-sync.mjs cursor-local` on start |
| Claude integration | Worker `claude-code` | **PARTIAL→REAL probe** | Registry probe `claude --version` | Same ack duty | Claude | Sync on session start |
| Codex integration | Worker `codex-local` | **PARTIAL→REAL probe** | Registry; preferred verifier profile | Same | Codex | Sync on session start |
| Grok integration | Worker `grok-local` | **PARTIAL** | Registered; research-leaning declared caps | Not in dispatch loop | Cursor | Eligible when research capability required |
| Claw integration | Worker `claw-local` | **MISSING install** | Registered with `claw --version` probe (fails until installed) | Honest UNAVAILABLE until probe ok | Mason / ops | Install only with approval; then sync |
| Command Center owner view | Matter Control section | **REAL (V1)** | `/api/matter/orchestration` + `MatterControlSection` | Reads files; Vercel may show stale heartbeats (honest) | Cursor | Owner nav → Matter Control |

---

## Vertical slice delivered (this cycle)

```
POLICY BROADCAST (MATTER_POLICY.json, content-hash version)
  → WORKER ACK (POLICY_ACKS.jsonl)
  → CAPABILITY HEARTBEAT + real probe
  → MATTER REGISTRY (WORKER_REGISTRY.json)
  → DYNAMIC TASK ROUTING (ROUTING_DECISIONS.jsonl)
  → COMPLETION REPORT (WORKER_OUTCOMES.jsonl)
  → VERIFICATION preference (builder ≠ verifier)
  → DURABLE AUDIT (jsonl ledgers + owner snapshot)
```

Tests: `npm run test:matter-registry` (17 hermetic assertions).

Safety retained: protected actions still demand owner approval; know≠apply for updates; no fake online statuses.
