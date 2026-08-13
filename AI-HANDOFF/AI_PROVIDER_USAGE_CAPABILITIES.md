# AI Provider Usage Capabilities

**Area:** AI-HANDOFF · **Status:** Draft (probe-based) · **Last updated:** 2026-08-13 · **Info owner:** Claude

> What each provider actually exposes for cost accounting. Probed locally with free commands only.
> `UNVERIFIED` means the capability looks available but has not been exercised (exercising it costs money).

| Provider | Subscription price | Token usage | API usage | Actual $ | Per-run data | Billing API | Local log | Collection method | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **Cursor** | UNKNOWN — plan not established | UNVERIFIED | UNVERIFIED | NO (local) | YES | UNKNOWN | YES | `cursor-agent --print --output-format stream-json` may emit usage events; session dirs under `~/.cursor/chats/<ws>/<id>/` give `createdAtMs`/`updatedAtMs` (duration) but `store.db` is opaque blobs | **low** |
| **Anthropic / Claude** | $100/mo (owner-reported) | YES (API) | YES | via Console | YES (API) | Console only | partial | API responses carry `usage.input_tokens`/`output_tokens`; subscription CLI sessions do not bill per token | medium |
| **OpenAI / Codex** | $20/mo ChatGPT (owner-reported) | YES (API) | YES | via Console | YES (API) | Console only | UNKNOWN | `codex` CLI not installed — nothing probed | **low** |
| **xAI / Grok** | $99/mo (owner-reported) | YES (API) | YES | via Console | YES (API) | UNKNOWN | via app logs | app calls `api.x.ai` through the OpenAI SDK; usage is in the response envelope | medium |
| **Supabase** | $25/mo (owner-reported) | n/a | YES | Dashboard | n/a | Management API | n/a | fixed subscription; usage-based overage possible | medium |
| **Vercel** | $10/yr domain (owner-reported) | n/a | YES | Dashboard | n/a | YES | n/a | fixed; watch for function/bandwidth overage | medium |

## Rules

1. **Never store billing credentials just for accounting.** Prefer runtime telemetry (token counts already in API responses) over billing APIs.
2. **No scraping.** Provider dashboards are read by the owner and entered as reconciliation evidence.
3. **A missing number is `UNKNOWN`.** A provider that hides cost must never make our spend look smaller.
4. Subscription-plan usage (Claude Code, Cursor plan, ChatGPT) is **not per-token billed** — it consumes plan quota. Quota consumption is still recorded as a run with `cost_amount: null`, because exhausting quota has real financial consequences.

## Biggest gap

**Cursor.** Its plan price is unknown and its local session store does not expose tokens or dollars. Until either `stream-json` is confirmed to emit usage or the owner records the plan price, all Cursor spend is `UNKNOWN` — including the 2026-08-12 incident.
