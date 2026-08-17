# Party Perfect — 24/7 Autonomy Audit (runtime evidence, not architecture)

**Date:** 2026-08-17 08:5x CDT · **Method:** live probing of launchd, processes, ports, logs, queues, registries, power state. No component scored on documentation.

## VERDICT

**The Party Perfect brain is NOT currently operating 24/7 without Mason.**

The single most damning number: **45 of 47 tasks have gone untouched for more than 2 days**, 25 of them still `NEW` — created, never claimed, never dispatched, never failed. Nothing picked them up. Only **2 of 47** ever reached `CERTIFIED_PASS`.

Two things are genuinely healthy: the **safety layer** (it correctly refuses unsafe work) and the **cloud crons** (they run regardless of this Mac). Almost everything else is code that exists but is not being executed on a schedule.

---

## L. COMPONENT MATRIX

| Component | Expected autonomy | Current REAL state | Auto? | Runtime evidence | Last success | Failure mode | Cost | Gap → Fix | Pri |
|---|---|---|---|---|---|---|---|---|---|
| Durable task queue | tasks persist, survive restart | `MASTER_STATE.json` + append-only `TASK_QUEUE.jsonl`, 47 tasks | **PARTIAL** | queue read/written all session | 2026-08-15 | tasks persist but nothing consumes them | $0 | no consumer → wire dispatcher | P1 |
| Task leases | work leased, expiry reclaims | **absent from control plane** (`lease` matches = 0) | **NO** | grep `control-plane.mjs` | — | a crashed worker's task is never reclaimed | $0 | add lease+expiry | **P0** |
| Dead-letter queue | permanent failures quarantined | **does not exist** (`DEAD_LETTER` matches = 0) | **NO** | grep | — | **failures can vanish silently** | $0 | add DLQ | **P0** |
| Retry/backoff | ordinary failure retried | only in `runtime/watch-tick.mjs` (now unscheduled) | **NO** | launchd has no such job | — | no retry anywhere in live path | $0 | fold into dispatcher | P1 |
| Scheduler (launchd) | fires reliably | `com.partyperfect.matter` loaded, `StartInterval 600`, but **no log output for 2.6 days**; `runs=56` total | **NO** | `launchctl print`; log mtime 08-14 23:25 | 08-14 23:25 | timers not firing; kickstart works instantly | $0 | supervise + alert on silence | **P0** |
| Dispatcher (provider-neutral) | routes by capability | **legacy name-routing still controls**: `dispatchParallel(["cursor","codex"])`, `WORKERS={cursor,codex}`, `SUBSYSTEM_OWNER{por:claude,…}` | **NO** | `09_legacy_routing.txt`; orchestrate.mjs:57,204 | — | Matter still told *"send to Cursor"*, not *"needs X"* | $0 | V2 cutover (gated on Codex) | P1 |
| Provider-neutral router (V1) | selects by capability | built, tested 17/17, **wired to nothing** | **NO** | commit `51c362cb…`, not merged | n/a | selection layer only | $0 | cutover after re-verify | P1 |
| Worker registry | live capability truth | V1 registry real + probed; **legacy `WORKERS.json` stale** (says codex `NOT_INSTALLED`; it is installed) | **PARTIAL** | live probes | 08-15 05:40 | two competing registries | $0 | retire legacy file | P1 |
| Policy + acks | broadcast + acknowledged | policy `1.0.0+027e1c37c161`; 3 acks with transcripts, 5 script-written | **PARTIAL** | `POLICY_ACKS.jsonl` | 08-15 05:40 | acks unauthenticated | $0 | signed acks | P1 |
| Capability heartbeats | fresh liveness | **all stale: claude 112.9h, codex 87.9h, cursor 56.3h, dispatcher 111.9h** | **NO** | `HEARTBEATS.json` | 08-12 | nothing emits heartbeats; nothing alerts on silence | $0 | heartbeat on every run + staleness alarm | **P0** |
| Verification loop | independent verify | enforced in code (self-certify blocked); **not running** | **PARTIAL** | tests pass; queue idle | 08-13 | 7 tasks stuck `NEEDS_FIX` | $0 | needs dispatcher | P1 |
| Reboot recovery | survives restart | launchd jobs load; **intake worker is an orphan** (pid 42490, ppid 1, launchd shows `runs=1`, not tracked) | **PARTIAL** | `ps`, `lsof :8788` | running 4.8d | if it dies, nothing restarts it | $0 | re-adopt under launchd | **P0** |
| **iMessage bridge** | inbound trigger | **ALIVE** pid 40933 | **YES** | `pgrep` | live | reply path still stub (`mikeReply`) | $0 | merge live-answer branch | P1 |
| Mike (hiring/people) | wakes on application | brain exists (`mike-brain`), **no application watcher at all** | **NO** | no hiring watcher in runtime | never | applications never wake Mike | $0 | build watcher | P2 |
| Madison (marketing) | scheduled prep | **no runtime whatsoever** | **NO** | no `madison/` dir | never | agent exists in name only | $0 | prep-only workflows | P2 |
| Email autonomy | inbox → task | `lib/imap-sync.ts` exists in app; **no watcher process/cron** | **NO** | not in launchd or vercel crons | never | inbound email never becomes a task | $0 | cheap IMAP poller | P2 |
| Time watchers | clock-out/payroll alarms | `lib/time/*` app code only; **no watcher** | **NO** | not scheduled | never | Shelly/Mason must look manually | $0 | SQL-rule cron | P2 |
| Capability watch | detect provider updates | `capability-watch.mjs` **created today, never run, not scheduled** | **NO** | no output files; not in launchd | never | Mason still tracks releases | $0 | schedule weekly | P2 |
| **Governor (cost gate)** | budget + kill switch | **REAL and enforcing**: `AUTONOMOUS PAID COMPUTE: OFF`, 12 blocked attempts | **PARTIAL** | `governor/cli.mjs status` | 08-13 | **budget NOT SET; 41 runs with no cost data; MTD UNKNOWN** | unknown | set budgets, capture tokens | **P0** |
| Cost instrumentation | per-call tokens/$ | `COMPUTE_LEDGER.jsonl` 53 lines, stale 08-13 | **NO** | file mtime | 08-13 | spend is unmeasured | unknown | instrument every call | **P0** |
| **Vercel crons** | cloud-side, Mac-independent | **2 real**: `/api/cron/social` \*/15, `/api/cron/weekly-recap` Mon 14:00 | **YES** | `vercel.json` | recurring | narrow scope only | Vercel | extend for watchers | — |
| **OpenClaw gateway** | always-on service | **RUNNING** pid 13439, state=running | **YES** | `launchctl print` | live | role in Matter undefined | $0 | register as worker | P2 |
| github-bridge | ingest issues | **DEAD** — `runs=1`, exit 1, `gh` not authed | **NO** | log: *"we did not look"* | never | fails silently every 300s | $0 | `gh auth login` (Mason) | P1 |
| meeting-watcher | watch meetings | **DEAD** — `runs=3`, exit 126 (works manually) | **NO** | `launchctl print` | 08-11 | env/PATH differs under launchd | $0 | fix env | P2 |
| Owner health board | one screen | `DASHBOARD.md`, governor + matter boards — all **stale/fragmented** | **NO** | mtimes days old | — | Mason cannot answer "is my brain working?" | $0 | single page | P1 |
| Safety gates | refuse unsafe work | **STRONG**: self-certify block, `por_write` blocked for all workers, approval gates, secret guard, governor OFF | **YES** | routing case F blocked; 12 paid blocks | live | — | $0 | keep | — |

---

## AUTONOMY SCORE: **31 / 100**

| Area | Score | Why (evidence, not intent) |
|---|---|---|
| Matter Core | **5 / 20** | Durable queue + append-only audit are real. But no leases, no DLQ, no retry; scheduler silent 2.6 days; legacy name-routing still controls; 45/47 tasks stalled. |
| Workers | **7 / 15** | 5 real, installed, authenticated, probeable (claude 2.1.226, cursor-agent 2026.08.11, codex-cli 0.147.0, grok 0.2.82, OpenClaw 2026.5.4). None autonomously dispatchable today. |
| Business Agents | **3 / 15** | Mike partially real (bridge alive, answer path unmerged/unarmed). Madison has no runtime. Others are config entries. |
| Triggers / Watchers | **4 / 15** | iMessage bridge live + 2 Vercel crons real. No email, hiring, time, or capability watcher running. 3 launchd watchers dead. |
| Recovery | **3 / 15** | Idempotent create guards work. No leases/DLQ/retry; dead services stayed dead for days; intake worker orphaned and unsupervised. |
| Cost Control | **4 / 10** | Governor genuinely blocks paid compute (12 blocks) — real. But no budget set, no per-call cost captured, MTD UNKNOWN. |
| Observability | **1 / 5** | Boards exist but stale; heartbeats 2–5 days old and *nothing notices*. |
| Safety | **4 / 5** | Best area. Permission gates, self-certify block, approval gates, secret guard all verified working. |

**Reading:** this is a well-engineered *safety and task-modelling* system with **almost no running automation**. It is not close to a week alone — but the missing pieces are execution plumbing, not intelligence.

---

## M. IMPLEMENTATION PLAN

### P0 — prevent silent failure / data loss / unmeasured spend
1. **Dead-letter queue + task leases** in `control-plane.mjs`. Today a crashed worker's task is never reclaimed and a permanent failure can vanish. *A task disappearing silently is an automatic FAIL — this is that.*
2. **Watchdog + staleness alarm.** Nothing noticed that every heartbeat was 2–5 days stale and the orchestrator hadn't logged for 2.6 days. One cheap deterministic check → alert Mason if any expected tick is overdue.
3. **Fix the scheduler.** `kickstart` runs instantly, so the code is fine; the timers are not firing. Re-load the jobs, and have the watchdog assert "matter ticked within 20 min".
4. **Re-adopt the orphaned intake worker** (pid 42490, ppid 1) under launchd so it restarts on death/reboot.
5. **Cost capture + budgets.** 41 runs with no cost data and `MONTHLY BUDGET: NOT SET`. Instrument tokens/cost per call and set daily/monthly caps before enabling autonomous paid compute.

### P1 — make Matter actually dispatch
6. Finish Codex re-verification → **V2 cutover** from name-routing to the capability router; retire `dispatchParallel(["cursor","codex"])` and stale `WORKERS.json`.
7. **Heartbeat on every worker run** (the registry has the plumbing; nothing calls it).
8. Merge + arm **Mike live-answer** (`claude/mike-live-answer-001`) so the bridge stops replying with a stub.
9. `gh auth login` (Mason) to revive the github-bridge — it currently fails honestly but forever.
10. **One owner health page** answering "is my brain working?" from real files.

### P2 — business-agent automation (only after P0/P1)
11. Cheap IMAP/Gmail **poller** → relevance filter → Matter task. Deterministic filter first; LLM only on a real hit. Sends stay approval-gated.
12. **Hiring watcher** so an application wakes Mike without Mason.
13. **Time watchers** (missing clock-out, open lunch, Friday/Monday payroll) as SQL rules on a cron — no LLM.
14. **Madison prep-only** workflows. Automatic *preparation*, never automatic *publication*.
15. Schedule **capability-watch** weekly; register OpenClaw as a worker.

### P3
16. Benchmarks to convert declared → measured capabilities; learned routing scores.

**Not recommended:** adding more agent personas. One reliable event-driven dispatcher beats ten idle personas — and today every persona is idle for exactly the same reason.

---

## Caveats on this audit

- The 600s timer test was **inconclusive on its own** (only 3.4 min elapsed after kickstart); the 2.6-day log gap is the actual evidence that scheduling is broken.
- Sleep was ruled out: `caffeinate` has held `PreventSystemSleep` for 240 h, so the Mac was awake while nothing ran.
- Cost figures are **UNKNOWN, not zero** — the governor reports 41 runs with no cost data.
- `capability-watch.mjs` and several `matter/` files were created by a concurrent agent during this session; they are counted as *not autonomous* because they have never run and are not scheduled.
