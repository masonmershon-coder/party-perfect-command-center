# AI Fixed Subscriptions

**Area:** AI-HANDOFF · **Status:** Owner-reported, NOT provider-verified · **Last updated:** 2026-08-13 · **Info owner:** Mason

> Recurring baseline. These are **manually reported by Mason** and must not be presented as provider-verified charges.
> Machine-readable source of truth: `governor/FIXED_SUBSCRIPTIONS.json` (falls back to `DEFAULT_FIXED` in `accounting.mjs`).

| Provider | Label | Price | Cadence | Verified against provider? |
|---|---|---|---|---|
| supabase | Supabase | $25 | monthly | No |
| anthropic | Claude | $100 | monthly | No |
| openai | ChatGPT | $20 | monthly | No |
| xai | Grok | $99 | monthly | No |
| vercel | Vercel / domain | $10 | yearly | No |
| cursor | Cursor | **UNKNOWN** | UNKNOWN | No |

**Computed known monthly:** $244.83 · **Owner-reported yearly:** $2,938

The yearly Vercel line is amortized (÷12), not counted as a monthly charge.

**Cursor is deliberately `UNKNOWN`, not `$0`.** A subscription whose price we have not established would otherwise understate the baseline. It appears in the dashboard as `PRICE NOT ESTABLISHED`.

Changing any number here requires Mason. Nothing in the system infers a subscription price.
