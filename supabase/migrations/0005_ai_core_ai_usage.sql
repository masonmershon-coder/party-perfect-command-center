-- ============================================================
--  Mershon AI — AI CORE 0005: AI USAGE / COST OBSERVABILITY
--  One row per AI operation. Metrics + refs only — NEVER prompt/response
--  bodies, credentials, or PII. Lets us answer: what did AI cost, by
--  persona/domain/operation; when did we escalate; how big is context;
--  what % served from cache. Additive; NOT auto-applied. No dashboard here.
-- ============================================================

create table if not exists ai_core.ai_usage (
  id                    uuid primary key default gen_random_uuid(),
  at                    timestamptz not null default now(),   -- server-stamped
  domain                text not null,
  persona               text,                                  -- mike | matter | madison | null
  provider              text not null,                         -- xai | fal | openai | local
  model                 text,
  operation             text not null,                         -- chat|voice|quote|design|recap|draft-reply|meeting|transcribe|embed|other

  input_tokens          integer,
  output_tokens         integer,
  cached_tokens         integer,                               -- if provider reports it; else null
  est_cost_usd          numeric(12,6),                         -- tokens x rate table (approx ok)
  actual_cost_usd       numeric(12,6),                         -- when provider returns real cost

  latency_ms            integer,
  retries               integer not null default 0,
  success               boolean not null default true,
  error                 text,

  from_cache            boolean not null default false,        -- whole result reused -> zero new spend
  escalated             boolean not null default false,        -- routine model -> strong model
  escalation_reason     text,
  context_record_count  integer,
  context_refs          jsonb not null default '[]'::jsonb,    -- ids/paths only, not content

  -- soft references (no composite FK: usage must log even for route-level jobs
  -- with no persisted task row, and must never fail the underlying operation)
  task_id               uuid,
  artifact_id           uuid,
  meeting_id            uuid,
  job_ref               text                                    -- route/job id when not a task
);

create index if not exists ai_usage_domain_at_idx on ai_core.ai_usage (domain, at desc);
create index if not exists ai_usage_provider_model_idx on ai_core.ai_usage (provider, model);
create index if not exists ai_usage_operation_idx on ai_core.ai_usage (domain, operation);
create index if not exists ai_usage_task_idx on ai_core.ai_usage (task_id);

-- RLS consistent with 0003: service_role full; business staff read party_perfect only.
alter table ai_core.ai_usage enable row level security;
grant all on ai_core.ai_usage to service_role;
drop policy if exists ai_usage_service_all on ai_core.ai_usage;
create policy ai_usage_service_all on ai_core.ai_usage for all to service_role using (true) with check (true);
grant select on ai_core.ai_usage to authenticated;
drop policy if exists ai_usage_biz_read on ai_core.ai_usage;
create policy ai_usage_biz_read on ai_core.ai_usage for select to authenticated using (domain = 'party_perfect');

comment on table ai_core.ai_usage is
  'Per-operation AI usage/cost/latency. Metrics + refs only, never bodies/secrets/PII. Feeds cost audit; no bodies stored.';
