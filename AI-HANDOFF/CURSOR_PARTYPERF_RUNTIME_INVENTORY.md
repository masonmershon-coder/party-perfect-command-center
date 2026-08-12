# Cursor / Party Perfect Runtime Inventory

**Read-only discovery, 2026-08-12.** Answers: is there a programmatically-launchable agent runtime on this Mac?

## Repo / workspace
- **Command Center repo:** `/Users/mikeai/grok-dashboard` (git). Remote: `github.com/masonmershon-coder/party-perfect-command-center`. Current branch `claude/por-stat-classification`, **working tree is DIRTY** (uncommitted Cursor/Claude work) → autonomous edits must use isolated worktrees.
- **AI-HANDOFF control plane:** `/Users/mikeai/grok-dashboard/AI-HANDOFF/` (control-plane.mjs + MASTER_STATE.json + runtime/).
- **git worktree isolation:** ✅ verified working on the dirty repo (created + removed an isolated branch checkout without touching the main tree).

## Agent runtimes (the decisive finding)
| Runtime | Present? | Notes |
|---|---|---|
| **`cursor-agent`** (Cursor headless CLI agent) | ❌ **NOT installed** anywhere on PATH or common dirs | this is the *real* programmatic Cursor runtime — required for autonomy |
| Cursor.app GUI CLIs (`cursor`, `code`, `*-tunnel`) | ✅ present (v3.9.16 app) | **open the editor GUI only — cannot implement code headlessly** |
| **`codex`** (OpenAI Codex CLI, for `codex-local`) | ❌ NOT installed | needed for a *local* verifier that can read Cursor's worktree |
| `gh` CLI | ✅ present | **not logged in** (needed for GitHub-trigger + PR push) |
| Cursor Cloud/Background Agents | account feature | run in Cursor's cloud on the GitHub repo; can't reach local SSD/ENTERPRISE (fallback #14) |

## Access surfaces
Vercel: logged in (`masonmershon-6922`) · Supabase CLI: present · GitHub: repo known, `gh` not authed.

## What this means
There is **no headless agent runtime installed** to launch programmatically. The local execution **harness** (dispatcher, worktree isolation, locking, heartbeats, repair routing) is built and proven with **stub** workers — but real Cursor autonomy is blocked on installing + authenticating a headless runtime.

## Single blocker (owner action)
Install + authenticate **`cursor-agent`** (Cursor headless CLI) — and, for a local verifier, a **`codex` CLI** — then set their `launch` command in `runtime/WORKERS.json`. The harness then runs the real loop unchanged. Do **not** curl|bash an installer unattended; this is an owner install+login step.
