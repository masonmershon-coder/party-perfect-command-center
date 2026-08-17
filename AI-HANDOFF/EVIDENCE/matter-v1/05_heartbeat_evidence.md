# §5 — Heartbeat / probe evidence (sanitized)

Candidate: `51c362cb1187d3459d103bd2768767ef3934612e`

## Probe mechanism (candidate source, `matter-registry.mjs::probe`)

Availability is set **only** by spawning the worker's own `detect` argv and checking exit
status; `register()` never sets `available`. A worker with no `detect` is recorded
`available:false` with reason `"no detect probe configured"`. Test 2 asserts a fresh
registration is *not* available; test 3 asserts a real failing probe (`false`) reports
UNAVAILABLE.

## Observed probes — live state at `2026-08-15T05:40:40Z`

| Worker | Observed executable | Observed version | Probe time (UTC) | Available | Latency |
|---|---|---|---|---|---|
| `claude-code` | `claude --version` | `2.1.226 (Claude Code)` | `05:40:38.910Z` | **true** | 119 ms |
| `cursor-local` | `cursor-agent --version` | `2026.08.11-e8db854` | `05:40:40.086Z` | **true** | 545 ms |
| `codex-local` | `codex --version` | `codex-cli 0.147.0` | `05:40:40.294Z` | **true** | 91 ms |
| `grok-local` | `grok --version` | `grok 0.2.82 (6d0b07d2de0f)` | `05:40:40.394Z` | **true** | 23 ms |
| `claw-local` | `claw --version` | `null` (binary absent) | `05:40:40.399Z` | **false** | 1 ms |

`claw-local` is the control case: a registered worker whose probe fails is reported
UNAVAILABLE and is excluded from routing with the reason
`"not available (probe failed or never probed)"` (routing evidence D).

### Two stale hard-coded statuses caught by live probing

1. `AI-HANDOFF/runtime/WORKERS.json` declares `codex-local: "NOT_INSTALLED"`. The probe shows
   `codex-cli 0.147.0` installed **and** `codex login status` → "Logged in using ChatGPT".
   The hard-coded status is stale; the probe is correct.
2. An earlier pinned path `.../claude-code/2.1.222/.../claude` failed its probe because the
   installed build had moved on. Re-registering with the version-independent binary fixed it.
   The registry surfaced the drift instead of asserting health.

## Capability provenance — DECLARED vs MEASURED

Counted from the live registry:

```
declared = 19    measured = 0
```

**Every capability level currently in the registry is DECLARED (self-asserted).**
None has been measured by a Party Perfect benchmark. `heartbeat()` records a capability change
and appends `CAPABILITY_CHANGE_DETECTED` to the audit log with the explicit note
`"recorded; routing weight unchanged until evidence supports it"` — a vendor claim never
converts to authority by itself (policy §3/§4). The `board()` renderer marks measured
capabilities with `*`; today no row carries a `*`.

Consequence Codex should weigh: **routing today is driven by numbers the workers assert about
themselves.** That is a real limitation of V1, not a defect of the router.

## Staleness / expiry behaviour

- Policy field: `heartbeat_max_age_minutes: 60`.
- `route()` computes `age = now - last_heartbeat` and rejects a worker with
  `"heartbeat stale (Nm)"`, or `"no heartbeat"` when it never sent one.
- Test 8 covers exclusion-with-reason for the unavailable/stale path.
- Heartbeats are **not** self-expiring: nothing sweeps the registry: a worker stays
  `available:true` from its last successful probe until the next probe runs. Freshness is
  enforced at **selection time**, not by a background reaper. Stated plainly because
  "available" in the stored record can therefore be older than reality.

## Audit events

`CAPABILITY_CHANGE_DETECTED` rows are appended to
`AI-HANDOFF/matter/ROUTING_DECISIONS.jsonl` (same log as routing decisions), carrying
`{worker_id, changes:[{field, from, to}], note}`. Probe results themselves are written into the
registry record (`available`, `last_probe`, `latency_ms`) and are **mutable state, not an
append-only history** — see §8 durability.
