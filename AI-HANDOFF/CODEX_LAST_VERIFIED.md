# Codex — Last Verified

**Generated:** 2026-08-13T11:30:00.603Z · **Health:** RED · **Confidence:** low

> Maintained automatically by the Codex verifier worker. Do not hand-edit.

## System health

| | |
|---|---|
| SYSTEM HEALTH | **RED** |
| OPEN P0 | 0 |
| OPEN P1 | 2 |
| CLAUDE TASKS | 3 |
| CURSOR TASKS | 5 |
| CODEX VERIFYING | 0 |
| AWAITING VERIFICATION | 1 |
| BLOCKED ON MASON | 0 |

## Open findings

- **P1 · missing-evidence-artifact** (CONTROL-PLANE-CURSOR-SMOKE-001) — Cursor did not produce the required artifact
- **P1 · unmerged-branch** (CODEX-SWEEP-DAILY) — 15 commit(s) on 'claude/por-stat-classification' not in main — fixes are written but not deployed

## Needs Mason

_Nothing._

## Recent verifications

| when | task | verdict | worker |
|---|---|---|---|
| 2026-08-12T21:56:40.570Z | GOV-INT-001 | **BLOCKED** | codex-local |
| 2026-08-12T21:55:10.774Z | GOV-INT-001 | **BLOCKED** | codex-local |
| 2026-08-12T21:50:30.187Z | PP-SEC-001 | **BLOCKED** | codex-cloud |
| 2026-08-12T21:43:51.297Z | CONTROL-PLANE-CURSOR-SMOKE-001 | **BLOCKED** | codex-local |
| 2026-08-12T21:36:56.207Z | CONTROL-PLANE-CURSOR-SMOKE-001 | **CERTIFIED_PASS** | codex-cloud |
| 2026-08-12T21:36:51.317Z | CONTROL-PLANE-CURSOR-SMOKE-001 | **NEEDS_FIX** | codex-cloud |
| 2026-08-12T21:36:18.760Z | CONTROL-PLANE-CURSOR-SMOKE-001 | **CERTIFIED_PASS** | codex-cloud |
| 2026-08-12T21:36:09.834Z | CONTROL-PLANE-CURSOR-SMOKE-001 | **NEEDS_FIX** | codex-cloud |

## Worker health

- ⚠️ **codex-local** unavailable — Codex CLI not found on PATH (looked for "codex")
