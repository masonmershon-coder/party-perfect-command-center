# DECISIONS

Approved decisions worth preserving. Keep short. No secrets.

## 2026-08-11 — Shared handoff location

- **Decision:** Use repo-root `AI-HANDOFF/` in `grok-dashboard` as Claude ↔ Cursor coordination.
- **Why:** Command Center is Cursor’s primary workspace; Claude can read/write the same git tree / worktree.
- **Source:** Mason integration prompt; Cursor bootstrap when Claude had not yet created the folder.

## 2026-08-11 — POR remains system of record

- **Decision:** POR/Counter on ENTERPRISE is authoritative. App/Redis/Supabase/CSVs are mirrors only. No write-back to POR until Mason explicitly approves a future design.
- **Source:** Existing Party Perfect guardrails + POR 2.0 brief.

## 2026-08-11 — Cursor orientation mechanism

- **Decision:** Prefer `.cursor/rules` `alwaysApply` for handoff orientation; treat `sessionStart` hooks as best-effort only.
- **Why:** Known Cursor IDE race can drop `sessionStart.additional_context`.

## 2026-08-11 — Handoff reconciliation (Claude review of PP-HANDOFF-001)

- **Protocol canonical in `AGENTS.md`** (repo root; both Claude Code + Cursor auto-read). Claude removed its redundant `AI-HANDOFF/PROTOCOL.md`.
- **Archive standardized on `history/`** (Claude removed its `ARCHIVE/`).
- **Brain pointer added** in `09 - Claude Efficiency/BRAIN_STATUS_AND_ROADMAP.md` → this folder ("both linked").
- Note: Claude's `README.md` write overwrote Cursor's (uncommitted); kept as the Mason-facing explainer, references updated to AGENTS.md + history/.
- **PP-HANDOFF-001 → VERIFIED.**

## 2026-08-13 — AI cost ledger seed (Mason / USER_REPORTED)

- **Decision:** Owner AI Cost & Usage records these recurring amounts as **USER_REPORTED**, not provider-verified: Supabase $25/mo, Claude $100/mo, ChatGPT $20/mo, Grok $99/mo, Vercel/domain ~$10/yr (classification uncertain), Cursor unknown until verified (must not count as $0). Hardware purchases stay out of the recurring AI operating ledger. Dashboard observes/alerts only — no agent may change provider billing.
- **Source:** Mason OWNER-AI-COST-USAGE-001 (2026-08-13).

## 2026-08-13 — Customer site: rental company, not planners (Mason)

- **Decision:** Party Perfect is a **full-service event rental company**. Do not present as a wedding/event planning company. Planners are B2B customers. Empty Get Quote must offer guided choices (browse / start quote / request help / tent consultation). Careers → partyperfectjobs.com. No invented rates. No POR pricing changes. No deploy until review.
- **Source:** Mason Priority 3 (2026-08-13).

## 2026-08-13 — Jobs: Quick Apply removed (Mason)

- **Decision:** Party Perfect Jobs is **full application only**. The 60-second / Quick Apply path is **not** part of the product. Do not bring it back as a fallback, mobile path, feature flag, secondary CTA, or optional shortcut unless Mason explicitly changes this decision.
- **Why:** Short apply produced insufficient information to evaluate, contact, interview, and hire.
- **Restore target:** Pre-Quick-Apply / `f455daa` full validator + multi-step form (~2–3 min). No new hiring questions invented.
- **Source:** Mason priority Cursor task 2026-08-13; deploy approval same day (“get the original out there”).

## 2026-08-11 — Live relay (Mason-approved)

- **Decision:** Run `scripts/ai-handoff-relay.sh` for near-real-time notify + Claude auto-wake; gate with `AUTO_RELAY.enabled`; hard caps (90s debounce, 3 wakes/hour, `READY_FOR_CLAUDE*` only). Cursor wake = Notification Center + optional Cursor Automation.
- **Why:** Agents cannot share one chat process; filesystem + capped wake is the workable bridge.
- **Source:** Mason request to automate Claude↔Cursor keep-up.
