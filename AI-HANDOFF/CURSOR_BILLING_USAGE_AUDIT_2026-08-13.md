# Cursor billing & usage safety audit

**From:** Cursor · **Date:** 2026-08-13 · **Mode:** READ-ONLY (no billing/settings changes)  
**For:** Mason + Claude review  
**Canvas:** `~/.cursor/projects/Users-mikeai-grok-dashboard/canvases/cursor-billing-usage-audit.canvas.tsx`

---

## Scorecard

| Item | Value |
|------|--------|
| CURRENT FIXED MONTHLY COST (Cursor) | UNKNOWN |
| CURRENT METERED COST MTD (Cursor) | UNKNOWN |
| ON-DEMAND USAGE | UNKNOWN |
| SPENDING CAP | UNKNOWN |
| EXTERNAL API BILLING | ACTIVE |
| AUTOMATED PAID RUNS POSSIBLE | NO (current config) |
| MAXIMUM POSSIBLE ADDITIONAL SPEND | Cannot establish |
| RISK | UNKNOWN |

---

## VERIFIED FACTS

### Cursor account (local)
- Logged-in Cursor user in `~/.cursor/cli-config.json`: Apple Hide My Email, `userId` 380480007 (no plan field on disk).
- Default model: **Auto**, `maxMode: false`.
- `cursor-agent` CLI installed (`~/.local/bin/cursor-agent`, `2026.08.11-e8db854`) and **logged in**.
- `CURSOR_TRIGGER` unset · `CURSOR_API_KEY` unset · no `AI-HANDOFF/runtime/.cursor-secret`.

### What Cursor *can* charge above subscription (product docs, not this account)
Source: https://cursor.com/docs/account/pricing (fetched 2026-08-13)
- Individual: **Pro $20** · **Pro Plus $60** · **Ultra $200**/mo.
- Two usage pools: **Cursor Models** (Grok 4.6/4.5, Composer 2.5) and **Other Models** (third-party at API rates). Pro includes at least **$20** Other Models.
- After included usage: **on-demand** pay-as-you-go at same API rates, **or upgrade**. Docs say requests are not quality-downgraded.
- **Cloud Agents** (formerly Background Agents): charged at model API rates; docs say you are asked to set a spend limit on first use. Included on paid plans.
- **Teams**: on-demand **enabled by default**; team-wide spending limits exist; +$0.25/M Cursor Token Rate on third-party models. Individual vs Teams for *this* login: **not visible locally**.

### Agent / CLI / background vs subscription
- IDE Agent, `cursor-agent` CLI, and Cloud Agents all draw from the **same Cursor usage pools** (included then on-demand if enabled) — per Cursor docs. They are not a free extra channel.
- This interactive Cursor session **does consume** included/on-demand usage (Mason-initiated).

### Handoff / automations (cannot currently start paid Cursor without Mason)
- `AI-HANDOFF/AUTO_RELAY.enabled` exists. Relay auto-wakes **Claude only** (`claude --bg`), with 90s debounce + 3 wakes/hour. **Does not spawn Cursor.**
- `.cursor/hooks.json` sessionStart/afterFileEdit: inject handoff **context only** — no Cursor run.
- `AI-HANDOFF/cursor-dispatch.mjs` Cloud path: **parks** unless `CURSOR_TRIGGER=api|github`.
- `~/Library/LaunchAgents/app.pp.cursor-dispatch.plist` exists (would tick every 180s + WatchPaths) but **`launchctl` does not show it loaded**.
- Governor `AI-HANDOFF/governor/POLICY.json`: `autonomous_paid_compute: "OFF"`, `monthly_ceiling: null`.
- `AI-HANDOFF/cursor/RELEASED.txt`: **empty** (CC-AUTH-P0-001 not released). `CURSOR_MAX_AUTO_TIER` default **0**.
- `CURSOR_RUN_LEDGER.jsonl` (2026-08-12): stub runs + one `cursor-cli` **runtime_failed** + `GOV-INT-001` **compute_refused** (`AUTONOMOUS_PAID_COMPUTE is OFF`). No certified paid autonomous Cursor spend recorded.

### External credentials Cursor/app can use (names only — no values)
Present in `.env.local`: `XAI_API_KEY` (**active local billing path** for Command Center Grok/Imagine), plus Twilio, Meta, Redis/KV, Blob, GitHub, SMTP/IMAP, etc.
- `FAL_KEY` / `FAL_API_KEY`: **not** in `.env.local`; code supports fal if set (e.g. Vercel).
- No `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in `.env.local` (Cursor models go through Cursor, not BYOK locally).

### Things that can create a bill *outside* Cursor subscription
- **xAI** via `XAI_API_KEY` (Command Center).
- Possibly **fal.ai** if `FAL_KEY` is set on Vercel.
- Twilio / Meta / Upstash / Blob / GitHub — ops, not Cursor tokens.
- Governor `fixed_monthly_baseline` lists owner-reported Claude/ChatGPT/Grok/Supabase — **not invoice-verified here**.

---

## ASSUMPTIONS / UNKNOWNS

- Exact Cursor **plan** and invoice amount.
- Whether **on-demand** is ON or OFF for this account.
- **Spend limit** (if any) on Cursor Spending tab / Cloud Agents.
- Included usage **remaining** this cycle.
- **MTD on-demand $**.
- Whether this Apple Hide My Email login is a **Teams** seat (on-demand default ON) vs individual.
- Vercel production `FAL_KEY` / extra `XAI` spend this month.
- Whether loading `app.pp.cursor-dispatch` later would auto-fire (governor would still refuse until switch ON + budget).

**Maximum additional Cursor spend under current configuration:** cannot be stated. If on-demand is OFF → extra Cursor $ should be $0 until Mason enables it/upgrades. If ON with no cap → theoretically unbounded. If ON with a cap → that cap. **Do not guess.**

---

## What happens when included usage is exhausted

Per Cursor docs: enable **on-demand** or **upgrade**. If on-demand is off, Agent/CLI/Cloud work should stop rather than silently keep charging — **confirm on this account**.

---

## Mason — verify in Cursor billing dashboard (required)

1. https://cursor.com/dashboard → **Billing / Plan** (Hobby, Pro $20, Pro Plus $60, Ultra $200, or Teams Standard $40 / Premium $120).
2. https://cursor.com/dashboard/usage — included **Cursor Models** vs **Other Models** remaining.
3. https://cursor.com/dashboard/spending — **On-demand ON/OFF**, spend **cap**, MTD on-demand **$**.
4. Billing & Invoices — last invoice: subscription vs on-demand split.
5. Cloud Agents / Automations: enabled? spend limit set?
6. Confirm this login is **not** on a Team with on-demand default ON unless intended.

**Safe posture until verified:** keep governor OFF, do not load `app.pp.cursor-dispatch`, do not set `CURSOR_TRIGGER`, do not enable on-demand without a hard cap.

---

## Risk rationale

**UNKNOWN** overall: dashboard dollars missing.  
Local **automation** that could surprise-charge Cursor is currently **off** (governor + launchd not loaded + no cloud trigger). Interactive Agent use still depends on plan/on-demand — that is the open dollar risk.
