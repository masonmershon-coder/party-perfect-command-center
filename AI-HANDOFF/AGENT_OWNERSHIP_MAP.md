# Agent Ownership Map

_Enforced by `SUBSYSTEM_OWNER` in `control-plane.mjs`. A defect's subsystem deterministically picks its owner — no human routing._
_Last updated: 2026-08-12_

## Roles

| Agent | Role | Runtime today |
|---|---|---|
| **Claude** | POR / ENTERPRISE / local-systems engineer + control-plane builder | live |
| **Cursor** | Command Center product engineer (frontend/backend/api) | live — `cursor-agent` headless, local, authenticated |
| **Codex** | Independent auditor / verifier / repair-router | **CLI not yet on PATH** — see boundary note |
| **Mike / Madison** | Operational runtime agents (voice intake, marketing) | not autonomous workers |
| **ChatGPT** | Architecture (design input) | out-of-band |
| **Mason** | Owner — approves consequential actions only | human |

## Subsystem → owner (routing table)

| Subsystem | Owner |
|---|---|
| `por`, `enterprise`, `counter`, `rds`, `crystal`, `printer`, `bridge`, `observer`, `legacy` | **claude** |
| `product`, `frontend`, `backend`, `api`, `command-center` | **cursor** |
| `audit`, `verification`, `certification`, `security`, `regression` | **codex** |

Verifier defaults to **codex** for every task. Because `owner ≠ verifier` is enforced, a `codex`-owned task cannot be codex-verified — that's why Codex may not own a defect it raised.

## Runtime availability (detected, never asserted)

`RUNTIME` is probed at runtime (`detectRuntime()`), not hardcoded. An agent with no runtime cannot claim a parked task (`WAITING_FOR_WORKER`) and is never pretend-executed. Current: `claude:yes · codex:yes(engine)/no(CLI) · cursor:yes · mike:no · madison:no`.

## Boundary note (honest status)

The **Cursor** repair half is proven with the real `cursor-agent` runtime. The **Codex-verify** half runs through the engine's rules, but the standalone `codex` CLI worker is **not yet installed on PATH**, so fully-autonomous Codex verification is blocked at that runtime boundary. Everything else is executable now.
