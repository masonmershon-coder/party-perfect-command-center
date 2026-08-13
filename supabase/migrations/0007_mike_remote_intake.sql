-- ============================================================
--  Talk-to-Mike remote intake (cloud/app side)
--  Additive AI Core tables + private audio bucket.
--  Do NOT apply until Mason explicitly approves this migration.
--  Never apply 0001/0002 (POR) with this file.
-- ============================================================

create table if not exists ai_core.intake_devices (
  sender_id        text primary key check (sender_id in ('mason','josh')),
  token_sha256     text not null,
  revoked_at       timestamptz,
  response_thread  text not null,
  capabilities     text[] not null default array['intake']::text[],
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table ai_core.intake_devices is
  'Device identity registry. Stores SHA-256 verifiers only — never plaintext tokens.';

create table if not exists ai_core.intake_commands (
  message_id         uuid primary key,
  short_id           text not null,
  sender_id          text not null check (sender_id in ('mason','josh')),
  idempotency_key    text not null,
  fingerprint        text not null,
  state              text not null check (state in (
                       'RESERVED','QUEUED','LEASED','DELIVERED','DEAD_LETTER','EXPIRED'
                     )),
  object_path        text not null,
  content_type       text not null,
  bytes              bigint,
  duration_seconds   numeric,
  sha256             text,
  attempt_count      integer not null default 0,
  lease_until        timestamptz,
  lease_owner        text,
  dead_letter_reason text,
  retain_until       timestamptz,
  correlation_id     uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  queued_at          timestamptz,
  delivered_at       timestamptz,
  unique (sender_id, idempotency_key)
);
create index if not exists intake_commands_state_idx
  on ai_core.intake_commands (state, created_at);
create index if not exists intake_commands_lease_idx
  on ai_core.intake_commands (state, lease_until);

create table if not exists ai_core.intake_events (
  id                     bigint generated always as identity primary key,
  at                     timestamptz not null default now(),
  message_id             uuid not null,
  sender_id              text not null,
  state                  text not null,
  result_code            text not null,
  latency_ms             integer,
  worker_delivery_state  text,
  correlation_id         uuid
);
create index if not exists intake_events_msg_idx
  on ai_core.intake_events (message_id, at desc);

create table if not exists ai_core.intake_worker_heartbeats (
  id         bigint generated always as identity primary key,
  worker_id  text not null,
  at         timestamptz not null default now(),
  detail     jsonb not null default '{}'::jsonb
);
create index if not exists intake_worker_hb_idx
  on ai_core.intake_worker_heartbeats (at desc);

-- RLS: service_role only. Authenticated CC users cannot read intake rows.
do $$
declare t text;
begin
  foreach t in array array['intake_devices','intake_commands','intake_events','intake_worker_heartbeats'] loop
    execute format('alter table ai_core.%I enable row level security;', t);
    execute format('grant all on ai_core.%I to service_role;', t);
    execute format('revoke all on ai_core.%I from authenticated;', t);
    execute format('drop policy if exists %I on ai_core.%I;', t||'_service_all', t);
    execute format('create policy %I on ai_core.%I for all to service_role using (true) with check (true);', t||'_service_all', t);
  end loop;
end $$;

-- Private audio bucket (no public read). Size + mime limits match app policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mike-intake-audio',
  'mike-intake-audio',
  false,
  20971520,
  array['audio/mp4','audio/m4a','audio/x-m4a','audio/aac','audio/mpeg','audio/wav','audio/webm']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Private bucket + no anon/authenticated policies on this bucket.
-- service_role (app) bypasses Storage RLS. Do not add a catch-all
-- "bucket_id <> mike-intake-audio" grant — that would open other buckets.

comment on table ai_core.intake_commands is
  'Durable Talk-to-Mike command queue. Worker retries reuse message_id; never a second Matter task.';
