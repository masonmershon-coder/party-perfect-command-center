# Cursor Autonomy — Readiness Assessment

**Status:** Draft (read-only discovery, 2026-08-12) · **By:** Claude · settings NOT changed.
Goal: make `cursor` a real autonomous Command Center engineering worker using **Cursor's supported agent capabilities**, wired to the `AI-HANDOFF/` control plane.

## Discovered environment
| Item | Finding |
|---|---|
| Cursor app | **3.9.16** installed (`/Applications/Cursor.app`) — GUI |
| Headless agent CLI | **`cursor-agent` NOT on PATH** → no local headless runtime here |
| Cloud/Background Agents | **Account/cloud feature** — can't detect entitlement from disk; Mason confirms in the Cursor dashboard |
| Automations / Subagents | Same — Cursor account features |
| Workspace | `grok-dashboard` = the GitHub repo Cursor edits |
| Existing Cursor context | `AGENTS.md` + `.cursor/rules/` (`ai-handoff.mdc`, `spending-approval.mdc`) + `.cursor/hooks` — **Cursor already references AI-HANDOFF** |
| GitHub | repo `masonmershon-coder/party-perfect-command-center`; `gh` CLI **not logged in**; Cursor↔GitHub app connection = Mason |
| Vercel | logged in (`masonmershon-6922`) |
| Supabase CLI | 2.113.0 present |
| ⚠️ Collision risk | `grok-dashboard` is a **dirty working tree on branch `claude/por-stat-classification`** with lots of uncommitted changes — autonomous Cursor must use **isolated branches/worktrees/cloud checkouts**, never this tree |

## What "autonomous Cursor" means here
`cursor-agent` isn't installed, so the supported path is a **Cursor Cloud / Background Agent** operating on the **GitHub repo in Cursor's cloud** — it branches, implements, runs tests, opens a PR. This is exactly right for Command-Center repo work and matches your fallback #14: Cursor Cloud handles the repo; Claude/local workers handle SSD/ENTERPRISE; the control plane is the handoff.

## Can it be autonomous *today*? Not yet — 3 owner actions
1. **Enable Cursor Background/Cloud Agents** on the account (Cursor dashboard).
2. **Connect the Cursor GitHub app** to `party-perfect-command-center` (so Cloud Agents can branch + open PRs).
3. **Provide ONE trigger path** (so the deterministic dispatcher can wake an agent without a local CLI):
   - **a) Cursor Background-Agent API token** → stored in a secret store, referenced as `secret_store: cursor-agent-token` (never in a task record), **or**
   - **b) GitHub trigger** — allow the dispatcher to open a repo issue/PR that @-mentions the Cursor agent.

Until these exist, `cursor`-owned tasks correctly **park as `WAITING_FOR_WORKER`** (the engine refuses to pretend Cursor executed them).

## What Claude built now (no Mason, no faking)
- **Cursor instruction package** (durable context so any Cursor invocation "just knows" Party Perfect): `AI-HANDOFF/PARTY_PERFECT_SYSTEM_TRUTH.md`, `CURSOR_CAPABILITY_POLICY.md`, `CURSOR_QUEUE_CONSUMER.md`.
- **Deterministic dispatcher skeleton** `AI-HANDOFF/cursor-dispatch.mjs` — no AI reasoning; triggers the official Cursor runtime once a trigger path (3a/3b) is provided; otherwise reports "parked, runtime not configured."
- **First real task seeded**: `CC-AUTH-P0-001` (owner `cursor`, verifier `codex`) referencing the existing security finding — parked until the runtime is enabled.

## What does NOT need broadening (fallback #14)
`CC-AUTH-P0-001` is **repo-only** (API-route authorization) — a Cursor Cloud Agent can do it entirely in the GitHub checkout. **Do not** expose the PARTYPERF SSD or the ENTERPRISE LAN to Cursor cloud to make it "more autonomous"; those stay with Claude/local workers.
