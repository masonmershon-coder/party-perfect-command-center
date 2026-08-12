# Codex — event-driven verifier worker

Mason never relays prompts. Work finishes → shared state changes → Codex wakes → audits → routes the result back.

## The loop

```
Claude/Cursor finish  →  status = READY_FOR_VERIFICATION   (control-plane.mjs)
                      →  MASTER_STATE.json changes
                      →  launchd WatchPaths fires           (no polling)
                      →  dispatch.mjs selects + routes      (deterministic)
                      →  verify.mjs runs Codex              (the ONLY LLM call)
                      →  CERTIFIED_PASS | NEEDS_FIX | BLOCKED
                      →  NEEDS_FIX lands in the owner's queue automatically
                      →  owner repairs → READY_FOR_VERIFICATION → loop repeats
```

Only `verify.mjs` calls a model, and only for a task a deterministic dispatcher already picked. Nothing polls an LLM.

## Files

| | |
|---|---|
| `dispatch.mjs` | selects eligible tasks, routes to a worker class, runs them. Lock-guarded. |
| `verify.mjs` | one task end to end. Builds the prompt, runs Codex, parses the verdict, transitions. |
| `state.mjs` | maintains the four Mason-facing state files. Pure derivation. |
| `sweep.mjs` | `daily` / `weekly` deterministic audits. Opens findings, never certifies. |
| `status.mjs` | "Codex, everything good?" |
| `install.sh` | launchd agents. `--status`, `--uninstall`. |
| `certify.sh` | the automation certification test. |

State written to `AI-HANDOFF/`: `CODEX_CURRENT_STATUS.json`, `CODEX_AUDIT_LEDGER.jsonl` (append-only), `CODEX_OPEN_FINDINGS.json`, `CODEX_LAST_VERIFIED.md`.

## Mason's commands

```bash
node AI-HANDOFF/codex/status.mjs          # the board
node AI-HANDOFF/codex/status.mjs --full   # what changed / failed / needs you
```

## Worker routing

| Class | Verifies | Chosen when |
|---|---|---|
| `codex-local` | SSD, ENTERPRISE-adjacent files, local repos/tests | evidence path is `/Volumes/…`, `/Users/…`, `C:\…`, `\\…`, or subsystem is enterprise/counter/crystal/printer/rds/legacy |
| `codex-cloud` | production site/API, shared repo, remote source | everything else |

Routing is anchored to real filesystem roots, not brand names — a loose `PARTYPERF` match also matches `partyperfect.app` and would send a cloud-verifiable URL to a local-only worker. Cloud Codex is never handed local-only evidence.

## Safety properties

- **No self-certification.** The control plane rejects a verifier that owns the task, including on `BLOCKED`.
- **No fake greens.** If the Codex CLI is missing, times out, or returns junk, the task goes `BLOCKED` with the real reason and health goes RED. A verifier that cannot run never looks like one that ran and approved.
- **Read-only.** Codex runs `exec --sandbox read-only`.
- **False-green detector.** The daily sweep flags any `CERTIFIED_PASS` with no matching ledger entry as **P0**.
- **Append-only audit.** The ledger is never rewritten. Synthetic `CERTIFY-`/`TRIGGER-` ids are filtered from Mason's views, not from history.

## Health rules

`RED` any open P0, or a worker that cannot run · `YELLOW` any open P1, stale verification, or `NEEDS_FIX` backlog · `GREEN` otherwise.

## Certification

```bash
./certify.sh --plumbing   # proves dispatch/routing/state with a stub verifier
./certify.sh              # the real thing; needs the codex CLI
```

`--plumbing` passes today. The full run cannot pass until the `codex` CLI is installed — the harness refuses to certify without it, by design.

## Setup

```bash
./install.sh
```

Then install the Codex CLI and set `CODEX_BIN` if it isn't on `PATH`. Tunables: `CODEX_BIN`, `CODEX_ARGS`, `CODEX_TIMEOUT_MS` (default 15m).
