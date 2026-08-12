# AI Usage / Cost Logging — proposed minimal shape (PROPOSAL, awaiting Mason)

**From:** Claude · **Date:** 2026-08-12 · **Repo:** `grok-dashboard`
**Goal:** stop operating blind. Today every Grok (xAI) and fal.ai call streams the response and **discards `usage`** — we have zero visibility into spend, per-task cost, or when we escalate to a strong model. Establish the **hook + data shape** now, **before** we scale retrieval or autonomous bots.

**NOT in scope now:** no billing dashboard, no charts, no alerts. Just capture the record. Smart / fast / cheap / simple.

---

## Where it plugs in
One thin wrapper around the point where model calls happen — mainly `lib/grok.ts` (`streamGrokResponse` / `.responses.create`) and `lib/madison-media*.ts` (fal). Every AI job writes **one usage record** on completion (success or failure). Reuse the existing storage layer (`lib/durable-json.ts`: Redis → Blob → fs) so this needs **no new infra**; a table can come later.

## The minimal record (one per AI job)
```jsonc
{
  "id": "usage_<uuid>",
  "ts": "2026-08-12T15:04:05Z",   // stamped by the server, not the model
  "provider": "xai" | "fal" | "openai" | "local",
  "model": "grok-…",              // exact model id
  "domain": "party_perfect" | "mershon_personal",
  "persona": "mike" | "matter" | "madison" | null,
  "job_id": "<ai_core.tasks.id or route-level id>",
  "job_type": "chat" | "voice" | "quote" | "design" | "recap" | "draft-reply" | "meeting" | "other",

  "input_tokens":  0,
  "output_tokens": 0,
  "cached_tokens": 0,             // if the provider reports it; else null
  "latency_ms":    0,
  "retries":       0,
  "est_cost_usd":  0.0,           // tokens × per-model rate table (approx is fine)

  "context_record_count": 0,      // how many records/files were selected into context
  "context_refs": [],             // ids/paths of what was loaded (not the content)
  "from_cache": false,            // whole result served from cache → no model spend
  "escalated": false,             // routine model → strong model happened
  "escalation_reason": null,      // short string when escalated

  "success": true,
  "error": null
}
```

## Rules
- **Server stamps `ts`** (the runtime has no wall-clock in some paths — do not trust client time).
- **Capture even on cache hit / failure** — `from_cache:true` with zero tokens is exactly the signal we want (proof we avoided spend).
- **`est_cost_usd`** from a small per-model rate table in code; approximate is fine — we want trend, not accounting.
- **No prompt/response bodies** in the usage record — refs and counts only (keeps it cheap and PII-light).
- **Idempotent with intake:** when a result is reused via the artifact hash (PP-009 §D), log `from_cache:true` — a reused transcript should show **zero** new model tokens.

## Why this ordering
This record is what proves the end-goal loop is working — that the cheap router handled routine work, retrieval kept context small, and the strong model fired **only** when needed. Without it we can't tell whether the brain is getting cheaper as it scales. So it lands **before** retrieval scale-up and before autonomous bots.

## Success = we can answer, later, from the records
- What did AI cost this week, by persona/domain/job_type?
- Which jobs escalated to a strong model, and why?
- How big is the context we feed the model (are we sending too much)?
- What % of jobs were served from cache (avoided spend)?

**Decision needed from Mason:** approve this shape (or adjust fields) → then Cursor wires the hook. No dashboard until asked.
