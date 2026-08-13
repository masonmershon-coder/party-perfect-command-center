-- ============================================================
--  OWNER-AI-COST-USAGE-001 — extend AI Core usage (0005) + owner ledger
--  Additive. NOT auto-applied. Does not replace ai_core.ai_usage.
--  No secrets, prompts, transcripts, or customer PII.
-- ============================================================

-- Extend existing usage rows for idempotent ingestion / rate versioning.
alter table ai_core.ai_usage
  add column if not exists agent_id text,
  add column if not exists idempotency_key text,
  add column if not exists ingested_at timestamptz not null default now(),
  add column if not exists occurred_at timestamptz,
  add column if not exists rate_version text,
  add column if not exists source text,
  add column if not exists verification_status text,
  add column if not exists correlation_id text,
  add column if not exists audio_seconds numeric(12,3),
  add column if not exists human_triggered boolean not null default false,
  add column if not exists provider_event_ref text,
  add column if not exists status text,
  add column if not exists causation_id text,
  add column if not exists cached_output_tokens integer,
  add column if not exists reasoning_tokens integer,
  add column if not exists request_count integer not null default 1,
  add column if not exists transcription_seconds numeric(12,3),
  add column if not exists image_count integer,
  add column if not exists storage_bytes bigint,
  add column if not exists compute_ms bigint,
  add column if not exists extra_units jsonb,
  add column if not exists usage_kind text,
  add column if not exists fingerprint text;

update ai_core.ai_usage
  set occurred_at = coalesce(occurred_at, at)
  where occurred_at is null;

create unique index if not exists ai_usage_idempotency_uidx
  on ai_core.ai_usage (idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_usage_agent_occurred_idx
  on ai_core.ai_usage (agent_id, occurred_at desc);
create index if not exists ai_usage_correlation_idx
  on ai_core.ai_usage (correlation_id);

create table if not exists ai_core.ai_providers (
  id text primary key,
  label text not null,
  env_names text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists ai_core.ai_models (
  id text primary key,
  provider_id text not null references ai_core.ai_providers(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_core.ai_agents (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_core.ai_cost_rates (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  model text not null,
  version text not null,
  effective_from timestamptz not null,
  input_per_1m numeric(18,8),
  output_per_1m numeric(18,8),
  cached_per_1m numeric(18,8),
  source text not null default 'USER_REPORTED',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (provider_id, model, version)
);

create table if not exists ai_core.ai_subscriptions (
  id text primary key,
  provider_id text not null,
  plan text not null,
  amount numeric(18,6),
  currency text not null default 'USD',
  cadence text not null,
  effective_date date not null,
  source text not null,
  verification_status text not null,
  notes text not null default '',
  kind text not null,
  domain text not null,
  party_perfect_allocation_pct numeric(6,2),
  account_owner text not null default 'Mason',
  purpose text not null default '',
  renewal_date date,
  active boolean not null default true,
  inactive_date date,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'seed'
);

create table if not exists ai_core.ai_billing_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  period_start date not null,
  period_end date not null,
  billed_usd numeric(18,6),
  verification_status text not null default 'UNVERIFIED',
  source text not null,
  notes text not null default '',
  ingested_at timestamptz not null default now()
);

create table if not exists ai_core.ai_budgets (
  id text primary key,
  scope text not null,
  provider_id text,
  amount_usd numeric(18,6) not null,
  period text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists ai_core.ai_cost_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null,
  message text not null,
  dedupe_key text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  count integer not null default 1,
  active boolean not null default true,
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create table if not exists ai_core.ai_usage_import_runs (
  collector_id text primary key,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  status text not null default 'never'
);

create table if not exists ai_core.ai_cost_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text not null,
  detail text not null default ''
);

insert into ai_core.ai_providers (id, label, env_names) values
  ('anthropic', 'Anthropic / Claude', array['ANTHROPIC_API_KEY']),
  ('openai', 'OpenAI / ChatGPT / Codex', array['OPENAI_API_KEY']),
  ('cursor', 'Cursor', array[]::text[]),
  ('xai', 'xAI / Grok', array['XAI_API_KEY']),
  ('supabase', 'Supabase', array['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL']),
  ('vercel', 'Vercel', array['VERCEL_OIDC_TOKEN']),
  ('twilio', 'Twilio', array['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN']),
  ('github', 'GitHub', array['GITHUB_TOKEN']),
  ('upstash', 'Upstash Redis', array['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']),
  ('fal', 'fal.ai', array['FAL_KEY']),
  ('transcription', 'Transcription (local/whisper)', array[]::text[]),
  ('embeddings', 'Embeddings / vector', array[]::text[])
on conflict (id) do nothing;

insert into ai_core.ai_agents (id, label) values
  ('matter', 'Matter'),
  ('mike', 'Mike'),
  ('madison', 'Madison'),
  ('sentinel', 'Sentinel'),
  ('claude', 'Claude / Claw'),
  ('cursor', 'Cursor'),
  ('codex', 'Codex'),
  ('chatgpt', 'ChatGPT'),
  ('grok', 'Grok'),
  ('local_worker', 'Local worker / automation')
on conflict (id) do nothing;

-- USER_REPORTED seed only. Not provider-verified. Hardware excluded.
insert into ai_core.ai_subscriptions (
  id, provider_id, plan, amount, currency, cadence, effective_date, source,
  verification_status, notes, kind, domain, party_perfect_allocation_pct,
  account_owner, purpose
) values
  ('sub-supabase', 'supabase', 'Pro (owner-reported)', 25, 'USD', 'monthly', '2026-08-01', 'USER_REPORTED',
   'USER_REPORTED', 'USER_REPORTED $25/month. Not provider-verified.', 'fixed', 'party_perfect', 100, 'Mason', 'Command Center / AI Core database'),
  ('sub-claude', 'anthropic', 'Claude subscription (owner-reported)', 100, 'USD', 'monthly', '2026-08-01', 'USER_REPORTED',
   'USER_REPORTED', 'USER_REPORTED $100/month. Not provider-verified.', 'fixed', 'party_perfect', 100, 'Mason', 'Claude / Claw agent work'),
  ('sub-chatgpt', 'openai', 'ChatGPT Plus (owner-reported)', 20, 'USD', 'monthly', '2026-08-01', 'USER_REPORTED',
   'USER_REPORTED', 'USER_REPORTED $20/month. Not provider-verified.', 'fixed', 'party_perfect', 100, 'Mason', 'ChatGPT / Codex sessions'),
  ('sub-grok', 'xai', 'Grok subscription (owner-reported)', 99, 'USD', 'monthly', '2026-08-01', 'USER_REPORTED',
   'USER_REPORTED', 'USER_REPORTED $99/month. Not provider-verified.', 'fixed', 'party_perfect', 100, 'Mason', 'Grok / Mike model access'),
  ('sub-vercel', 'vercel', 'Vercel / domain-related (uncertain)', 10, 'USD', 'yearly', '2026-01-01', 'USER_REPORTED',
   'UNVERIFIED', 'Approximately $10/year. Classification still uncertain. USER_REPORTED, not provider-verified.', 'infrastructure', 'party_perfect', 100, 'Mason', 'partyperfect.app hosting / domain-related'),
  ('sub-cursor', 'cursor', 'UNKNOWN', null, 'USD', 'unknown', '2026-08-01', 'USER_REPORTED',
   'UNAVAILABLE', 'Cursor cost unknown until verified. Must not be counted as $0.', 'fixed', 'party_perfect', 100, 'Mason', 'Command Center implementation')
on conflict (id) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_providers','ai_models','ai_agents','ai_cost_rates','ai_subscriptions',
    'ai_billing_snapshots','ai_budgets','ai_cost_alerts','ai_usage_import_runs','ai_cost_audit'
  ]
  loop
    execute format('alter table ai_core.%I enable row level security', t);
    execute format('grant all on ai_core.%I to service_role', t);
    execute format('drop policy if exists %I_service_all on ai_core.%I', t, t);
    execute format('create policy %I_service_all on ai_core.%I for all to service_role using (true) with check (true)', t, t);
    execute format('revoke all on ai_core.%I from authenticated', t);
    execute format('revoke all on ai_core.%I from anon', t);
  end loop;
end $$;

comment on table ai_core.ai_subscriptions is
  'Owner-maintained fixed/infra ledger. USER_REPORTED unless verification_status=PROVIDER_VERIFIED. Editing never changes provider billing.';
