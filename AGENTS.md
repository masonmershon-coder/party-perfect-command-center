<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Party Perfect — cross-agent operating rules

## Team

| Role | Responsibility |
|------|----------------|
| **Mason** | Human GM / final approval for protected actions |
| **Matter** | Owns jobs, policy, routing, durable memory, verification gates |
| **Business agents** | Stable roles (e.g. Mike=hiring/people, Madison=marketing/design). The intelligence under them is replaceable. |
| **Workers / providers** | Replaceable (Claude, Cursor, Codex, Grok, Claw, future models). Selected by capability, never permanently assigned to a job. |

**Foundational rule:** Matter owns the jobs. AI providers are replaceable workers. Do not hard-code “Cursor always codes / Codex always verifies / Claude always ops.” See `AI-HANDOFF/matter/MATTER_POLICY.json` and `AI-HANDOFF/EVIDENCE/MATTER_ORCHESTRATION_V1_AUDIT.md`.

Current typical lanes (defaults only, not permanent assignments): Claude Code often handles brain/POR/ops; Cursor often implements Command Center; Codex often verifies. Matter may route differently whenever capabilities, health, or evidence support it.

Claude and Cursor are teammates on the same Party Perfect work — not competitors.

## Shared memory (filesystem)

Before substantive Party Perfect work — including new chats — agents MUST read:

1. `CLAUDE.md` / this `AGENTS.md`
2. `AI-HANDOFF/CURRENT_TASK.md`
3. Newest peer handoff (`AI-HANDOFF/CLAUDE_TO_CURSOR.md` or `AI-HANDOFF/CURSOR_TO_CLAUDE.md`)
4. `AI-HANDOFF/DECISIONS.md`
5. `AI-HANDOFF/BLOCKERS.md`
6. `AI-HANDOFF/REVIEW_QUEUE.md`
7. `git status` / current branch

Do **not** rely only on chat history. The filesystem is the shared Party Perfect memory.

**Live sync:** See `AI-HANDOFF/RELAY.md`. After a cycle, update your outbound handoff + `CURRENT_TASK.md` (and optionally `scripts/ai-handoff-ping.sh`). Do not busy-poll inside the agent — the relay handles wake/notify with caps.

Handoff folder = temporary coordination. Permanent knowledge → Party Perfect brain docs / `docs/`.

## Source of truth

**POR / Counter on ENTERPRISE** is authoritative for quotes, rates, contracts, deposits, payments, inventory availability.

Never invent inventory quantities, rates, prices, balances, payroll, customer data, or financial facts. If missing, say exactly what is missing.

## Secrets

Never put passwords, API keys, tokens, customer PII, or card data in `AI-HANDOFF/` or shared docs. Refer by env var name only.

## Task states

`NEW` · `CLAUDE_WORKING` · `READY_FOR_CURSOR` · `CURSOR_WORKING` · `READY_FOR_CLAUDE_REVIEW` · `CLAUDE_REVIEWING` · `REVISION_REQUIRED` · `VERIFIED` · `WAITING_FOR_MASON` · `DONE` · `BLOCKED`

Max **3** Cursor↔Claude revision cycles on one unresolved issue, then `WAITING_FOR_MASON`.

## Approval gates (stop for Mason)

Writing to live POR · customer/applicant outbound comms · social publish · ad spend · live price changes · payments/refunds · destructive DB/git · force push · high-risk production deploys · anything marked `APPROVAL_REQUIRED`.

## Cursor-specific

- Own the Command Center development path.
- When status is `READY_FOR_CURSOR`: set `CURSOR_WORKING`, implement in scope, test, write `CURSOR_TO_CLAUDE.md`, set `READY_FOR_CLAUDE_REVIEW`.
- Prefer simple, auditable handoffs over autonomous loops. No runaway polling inside the agent; use the capped relay (`AI-HANDOFF/RELAY.md`) for wake/notify.
