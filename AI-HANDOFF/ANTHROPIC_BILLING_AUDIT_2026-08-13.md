# Anthropic / Claude Billing & Usage Safety Audit

**Area:** AI-HANDOFF · **Status:** Read-only audit complete (local evidence) · **Date:** 2026-08-13 · **Auditor:** Claude
**Classification:** **GREEN** for Anthropic — with two caveats recorded below.

> Read-only. Nothing was purchased, enabled, upgraded, or changed. No key values were read, printed, or copied anywhere.

## Verdict

| | |
|---|---|
| CURRENT FIXED MONTHLY COST | **$100/mo** Claude Max (owner-reported; matches `default_claude_max_5x` tier) |
| CURRENT METERED COST MTD | **$0.00 — verified zero.** No Anthropic metered billing mechanism exists to charge against. |
| EXTRA USAGE | **OFF** — and disabled at the organization level |
| API BILLING | **INACTIVE** — no `ANTHROPIC_API_KEY` anywhere |
| AUTO-RECHARGE | **N/A / OFF** — requires API credits, which do not exist |
| MAXIMUM POSSIBLE ADDITIONAL SPEND | **$0.00** under the current configuration |
| RISK | **GREEN** |

## Evidence — verified locally

From `~/.claude.json` → `oauthAccount`:

| Field | Value | Meaning |
|---|---|---|
| `billingType` | `stripe_subscription` | Subscription, **not** API credits |
| `organizationType` | `claude_max` | Claude Max plan |
| `organizationRateLimitTier` | `default_claude_max_5x` | Max 5× tier |
| `hasExtraUsageEnabled` | `False` | Extra Usage **OFF** |
| `cachedExtraUsageDisabledReason` | `org_level_disabled` | Disabled at the **org level** — a stronger control than a per-user toggle |
| `subscriptionCreatedAt` | 2026-08-06 | Subscription active |

Environment and configuration:

- `CLAUDE_CODE_OAUTH_SCOPES = user:inference user:file_upload user:profile user:sessions:claude_code` → Claude Code runs on **OAuth subscription inference**, not API-key billing.
- `ANTHROPIC_API_KEY` — **not set** in the shell, and **not present** in `.env.local`, `~/.claude.json`, `~/.openclaw/openclaw.json`, `~/Matter`, or the Party Perfect notes tree.
- `ANTHROPIC_BASE_URL = https://api.anthropic.com` — standard endpoint, no proxy or gateway redirect.
- `@anthropic-ai/sdk` is **not installed** in `grok-dashboard`. The app's only AI SDK dependency is `openai`, pointed at **xAI/Grok** via `XAI_API_KEY` — that is xAI billing, not Anthropic.
- Zero credential-shaped strings (`sk-ant-…`) in any live config file.

## Automations that could create Anthropic charges — audited

| Path | Anthropic billing risk |
|---|---|
| `ai.openclaw.gateway` (armed, running) | Ships `@anthropic-ai/sdk` + `@anthropic-ai/vertex-sdk`, so it **could** bill Anthropic — but **no Anthropic key is configured**. Its `gateway.auth.token` is local gateway auth, unrelated. `sk-ant-` appears only as provider-support code in cached build bundles (0 real-key-shaped matches). **Currently inert for Anthropic.** |
| `app.matter.intake` | No Anthropic reference |
| `com.partyperfect.meeting-watcher` | No Anthropic reference |
| `com.partyperfect.codex.daily` / `.weekly` | Deterministic sweeps; call no model |
| `com.partyperfect.prevent-sleep` | `caffeinate` only |
| `app.pp.cursor-dispatch` | **Disarmed 2026-08-13** (was ungated → Cursor, not Anthropic) |
| Claude CLI at `~/.local/bin/claude` | Present, but **no automation invokes it** — no launchd plist, hook, or worker references it |

**No script, agent, hook, or service can create an Anthropic API charge without Mason starting Claude**, because no separately billed Anthropic mechanism is configured anywhere.

## What happens when the allowance is exhausted

With Extra Usage **off at the org level**, exhausting the Max 5× allowance results in **rate limiting until the window resets** — not overage billing. There is no configured path for usage to spill into separately billed API charges.

## Caveats — do not read this as permanently safe

1. **openclaw is the latent path.** It is an armed, running service that already ships the Anthropic SDK. Adding an `ANTHROPIC_API_KEY` to its environment would create metered billing immediately, with no governor in front of it. It is not currently in the compute governor's audited path table.
2. **Local evidence has a ceiling.** Everything above comes from local config. The authoritative record is Anthropic's billing console, which cannot be read from here.

## Mason should verify manually in the Anthropic console

1. **Plan** — confirm Claude Max 5× at $100/mo (billing → subscription)
2. **Extra Usage** — confirm OFF (local cache says `org_level_disabled`; confirm at source)
3. **API keys** — confirm **no active API keys** exist on the organization. This is the single most important check: a key that exists in the console but not on this Mac is invisible to this audit.
4. **Prepaid credits** — confirm balance is zero / none purchased
5. **Auto-recharge** — confirm OFF
6. **Spend limit** — note whether one is set and its amount
7. **Current month usage** — confirm $0.00 metered

## Related

- `AI_COST_CONTROL_ARCHITECTURE.md` · `AI_FIXED_SUBSCRIPTIONS.md` · `AI_COMPUTE_GUARDRAILS.md`
- Anthropic is **not** currently a variable-cost provider for Party Perfect; it belongs in the fixed-subscription ledger only.
