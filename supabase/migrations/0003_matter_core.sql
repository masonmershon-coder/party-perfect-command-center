-- ============================================================
--  Party Perfect AI OS — MATTER core (P1: shared data contract)
--  Neutral shared infrastructure. NOT Party-Perfect-only, NOT personal-only.
--  Personas ("Mike" = party_perfect, "Matter" = mershon_personal) live in the
--  APP layer, never in this schema. This schema only knows DOMAINS.
--
--  domain = the context/authority a record belongs to:
--    'party_perfect'      — business ops (persona: Mike)
--    'mershon_personal'   — Mason's personal/family (persona: Matter)
--    'mershon:<member>'   — a family member's namespace
--
--  domain is NOT NULL with NO default — every write MUST state its domain, so a
--  personal record can never silently fall into business context (and vice versa).
--
--  P1 scope: tables + status vocab + RLS boundary + domain tagging. NO gateway,
--  NO PWA, NO auto-dispatch, NO permission engine. Nothing here executes actions.
-- ============================================================

create schema if not exists matter;
grant usage on schema matter to authenticated, service_role;

-- ---------- projects (light grouping) ----------
create table if not exists matter.projects (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null,
  name        text not null,
  status      text not null default 'active',
  description text,
  created_at  timestamptz not null default now()
);

-- ---------- tasks — the universal work object ----------
create table if not exists matter.tasks (
  id                uuid primary key default gen_random_uuid(),
  domain            text not null,                 -- context/authority (required)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  type              text,                           -- software|ops|analysis|customer|website|pricing|por|meeting|other
  source            text,                           -- voice|text|photo|file|meeting|agent
  title             text not null,
  intent            text,
  input_context     jsonb not null default '{}'::jsonb,   -- REFERENCES, not copies: {brain_records:[], meeting_id, project_id, artifacts:[]}
  suggested_executor text,                          -- claude|cursor|chatgpt|grok|human|mike|madison ... (a WORKER, not a domain)
  assigned_executor  text,
  execution_mode    text not null default 'human_handoff'
                     check (execution_mode in ('human_handoff','manual_agent','automatic_agent')),
  status            text not null default 'NEW'
                     check (status in ('NEW','READY','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  approval_required boolean not null default false,
  priority          text default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date          date,
  result            text,
  output_artifacts  jsonb not null default '[]'::jsonb,    -- artifact ids/refs
  created_by        text,                           -- actor: mason|claude|cursor|gateway|meeting|...
  source_reference  text
);
create index if not exists tasks_domain_idx  on matter.tasks (domain);
create index if not exists tasks_status_idx  on matter.tasks (domain, status);
create index if not exists tasks_exec_idx    on matter.tasks (assigned_executor);

-- ---------- approvals — the choke point (explicit domain, per Mason) ----------
create table if not exists matter.approvals (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,                       -- explicit (denormalized from task) for fast/secure filtering + audit
  task_id      uuid references matter.tasks(id) on delete cascade,
  summary      text not null,
  risk         text check (risk in ('external','financial','irreversible','deletion','other')),
  status       text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz not null default now(),
  decided_by   text,
  decided_at   timestamptz,
  note         text
);
create index if not exists approvals_domain_status_idx on matter.approvals (domain, status);
create index if not exists approvals_task_idx on matter.approvals (task_id);

-- ---------- artifacts — pointers to large files (files live on SSD/Blob/iCloud) ----------
create table if not exists matter.artifacts (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null,
  kind           text,                              -- audio|transcript|pdf|image|export|video|other
  location       text,                              -- ssd|blob|icloud|git
  path_or_url    text,
  sha256         text,
  bytes          bigint,
  created_at     timestamptz not null default now(),
  related_task   uuid references matter.tasks(id) on delete set null,
  related_meeting uuid                              -- soft ref to matter.meetings (no hard FK to avoid ordering cycle)
);
create index if not exists artifacts_domain_idx on matter.artifacts (domain);

-- ---------- meetings — queryable meeting index (audio/transcript are artifacts) ----------
create table if not exists matter.meetings (
  id               uuid primary key default gen_random_uuid(),
  domain           text not null,
  meeting_key      text,                            -- pipeline id, e.g. 2026-08-11_153437_Weekly
  date             date,
  title            text,
  status           text default 'AWAITING_ANALYSIS' check (status in ('AWAITING_ANALYSIS','ANALYZED')),
  duration_seconds integer,
  transcript_ref   text,                            -- artifact id/path
  summary          text,
  participants     jsonb not null default '[]'::jsonb,
  source_audio_ref text,                            -- artifact id/path (text; avoids circular FK)
  created_at       timestamptz not null default now()
);
create index if not exists meetings_domain_idx on matter.meetings (domain);

-- ---------- brain_records — structured knowledge WITH status ----------
-- Long-form knowledge stays in git markdown; a brain_record is the queryable
-- status/metadata wrapper that can doc_ref that markdown OR hold a short fact.
create table if not exists matter.brain_records (
  id               uuid primary key default gen_random_uuid(),
  domain           text not null,
  status           text not null
                   check (status in ('DISCUSSION','PROPOSAL','DECISION','VERIFIED_FACT','UNVERIFIED_CLAIM','POLICY','SUPERSEDED','PENDING_REVIEW')),
  title            text not null,
  body             text,                            -- short structured fact (optional)
  doc_ref          text,                            -- path to git markdown for long-form (optional)
  source           text,
  source_reference text,
  created_at       timestamptz not null default now(),
  created_by       text,
  approved_by      text,
  effective_date   date,
  confidence       text check (confidence in ('low','medium','high')),
  supersedes       uuid references matter.brain_records(id) on delete set null,
  related_meeting  uuid references matter.meetings(id) on delete set null,
  related_project  uuid references matter.projects(id) on delete set null
);
create index if not exists brain_domain_status_idx on matter.brain_records (domain, status);

-- ---------- audit_log — append-only; every action attributable to a domain ----------
create table if not exists matter.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  domain      text not null,                        -- audit MUST be domain-attributable (Mason)
  actor       text,                                 -- who/what did it
  action      text,
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists audit_domain_at_idx on matter.audit_log (domain, at desc);

-- ============================================================
--  RLS — domain boundary (P1 baseline; NOT the full permission engine)
--  service_role: full (the gateway/loader/workers).
--  authenticated (business staff): may READ only domain='party_perfect'.
--  Personal domains (mershon_personal / mershon:*) are NOT exposed to the
--  business 'authenticated' role — they stay service_role-only until a
--  per-actor identity + allowed_domains layer is added later. This is what
--  stops personal Matter data from leaking into business context.
--
--  FUTURE (no core-table redesign needed): a matter.actor_permissions table
--  (actor, allowed_domains[], tool_permissions, read/write scope) will drive a
--  matter.can_access(domain) helper that these policies switch to. The core
--  tables already carry `domain` + `created_by`, so that layer bolts on.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','approvals','artifacts','meetings','brain_records','audit_log'] loop
    execute format('alter table matter.%I enable row level security;', t);
    execute format('grant all on matter.%I to service_role;', t);
    execute format('drop policy if exists %I on matter.%I;', t||'_service_all', t);
    execute format('create policy %I on matter.%I for all to service_role using (true) with check (true);', t||'_service_all', t);
    execute format('grant select on matter.%I to authenticated;', t);
    execute format('drop policy if exists %I on matter.%I;', t||'_biz_read', t);
    execute format($p$create policy %I on matter.%I for select to authenticated using (domain = 'party_perfect');$p$, t||'_biz_read', t);
  end loop;
end $$;

comment on schema matter is 'Party Perfect AI OS shared contract. Neutral; domain-tagged. Personas (Mike/Matter) are app-layer. No secrets. Personal domains are service_role-only until an identity/permission layer is added.';
