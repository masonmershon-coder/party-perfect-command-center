-- ============================================================
--  Mershon AI — AI CORE (P1: shared data contract)  [+ integrity pass]
--  NEUTRAL shared infrastructure. NOT named after any persona.
--  Personas run ON TOP of this core (app-layer), never in the schema:
--    "Mike"   = persona for domain 'party_perfect'   (business)
--    "Matter" = persona for domain 'mershon_personal' (Mason personal)
--
--  domain = the context/authority a record belongs to:
--    'party_perfect' | 'mershon_personal' | 'mershon:<member>'
--  domain is NOT NULL with NO default — every write MUST state its domain.
--
--  IDENTITY GOVERNS DOMAIN: a client may indicate a persona/domain, but the future
--  Gateway must validate the authenticated actor's authority and derive the effective
--  domain. A client-supplied domain string is never authorization.
--
--  INTEGRITY (this pass):
--   (1) Cross-domain referential integrity — a child record can only reference a
--       parent in the SAME domain, enforced by COMPOSITE foreign keys (id, domain).
--   (2) audit_log is APPEND-ONLY — a trigger rejects UPDATE/DELETE for everyone
--       (emergency admin can DISABLE the trigger as a superuser/owner).
--
--  P1 scope: tables + status vocab + RLS boundary + domain tagging + these two
--  integrity protections. NO gateway/PWA/auto-dispatch/permission-engine/event-engine.
-- ============================================================

create schema if not exists ai_core;
grant usage on schema ai_core to authenticated, service_role;

-- ---------- projects ----------
create table if not exists ai_core.projects (
  id          uuid primary key default gen_random_uuid(),
  domain      text not null,
  name        text not null,
  status      text not null default 'active',
  description text,
  created_at  timestamptz not null default now(),
  unique (id, domain)                              -- composite-FK target
);

-- ---------- tasks — the universal work object ----------
create table if not exists ai_core.tasks (
  id                uuid primary key default gen_random_uuid(),
  domain            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  type              text,
  source            text,
  title             text not null,
  intent            text,
  input_context     jsonb not null default '{}'::jsonb,   -- REFERENCES, not copies
  suggested_executor text,
  assigned_executor  text,
  execution_mode    text not null default 'human_handoff'
                     check (execution_mode in ('human_handoff','manual_agent','automatic_agent')),
  status            text not null default 'NEW'
                     check (status in ('NEW','READY','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  approval_required boolean not null default false,
  priority          text default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date          date,
  result            text,
  output_artifacts  jsonb not null default '[]'::jsonb,
  created_by        text,                           -- actor
  source_reference  text,
  unique (id, domain)                              -- composite-FK target
);
create index if not exists tasks_domain_idx on ai_core.tasks (domain);
create index if not exists tasks_status_idx on ai_core.tasks (domain, status);
create index if not exists tasks_exec_idx   on ai_core.tasks (assigned_executor);

-- ---------- meetings — queryable meeting index ----------
create table if not exists ai_core.meetings (
  id               uuid primary key default gen_random_uuid(),
  domain           text not null,
  meeting_key      text,
  date             date,
  title            text,
  status           text default 'AWAITING_ANALYSIS' check (status in ('AWAITING_ANALYSIS','ANALYZED')),
  duration_seconds integer,
  transcript_ref   text,
  summary          text,
  participants     jsonb not null default '[]'::jsonb,
  source_audio_ref text,
  created_at       timestamptz not null default now(),
  unique (id, domain)                              -- composite-FK target
);
create index if not exists meetings_domain_idx on ai_core.meetings (domain);

-- ---------- artifacts — pointers to large files (domain must match parents) ----------
create table if not exists ai_core.artifacts (
  id             uuid primary key default gen_random_uuid(),
  domain         text not null,
  kind           text,
  location       text,
  path_or_url    text,
  sha256         text,
  bytes          bigint,
  created_at     timestamptz not null default now(),
  related_task   uuid,
  related_meeting uuid,
  -- cross-domain integrity: an artifact can only point at a same-domain task/meeting
  foreign key (related_task, domain)    references ai_core.tasks(id, domain),
  foreign key (related_meeting, domain) references ai_core.meetings(id, domain)
);
create index if not exists artifacts_domain_idx on ai_core.artifacts (domain);

-- ---------- approvals — the choke point (domain must match its task) ----------
create table if not exists ai_core.approvals (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null,
  task_id      uuid,
  summary      text not null,
  risk         text check (risk in ('external','financial','irreversible','deletion','other')),
  status       text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz not null default now(),
  decided_by   text,
  decided_at   timestamptz,
  note         text,
  -- cross-domain integrity: an approval's domain MUST equal its task's domain
  foreign key (task_id, domain) references ai_core.tasks(id, domain) on delete cascade
);
create index if not exists approvals_domain_status_idx on ai_core.approvals (domain, status);
create index if not exists approvals_task_idx on ai_core.approvals (task_id);

-- ---------- brain_records — structured knowledge WITH status (same-domain refs) ----------
create table if not exists ai_core.brain_records (
  id               uuid primary key default gen_random_uuid(),
  domain           text not null,
  status           text not null
                   check (status in ('DISCUSSION','PROPOSAL','DECISION','VERIFIED_FACT','UNVERIFIED_CLAIM','POLICY','SUPERSEDED','PENDING_REVIEW')),
  title            text not null,
  body             text,
  doc_ref          text,
  source           text,
  source_reference text,
  created_at       timestamptz not null default now(),
  created_by       text,
  approved_by      text,
  effective_date   date,
  confidence       text check (confidence in ('low','medium','high')),
  supersedes       uuid,
  related_meeting  uuid,
  related_project  uuid,
  unique (id, domain),                             -- composite-FK target (for supersedes self-ref)
  -- cross-domain integrity: knowledge only references same-domain records
  foreign key (supersedes, domain)      references ai_core.brain_records(id, domain),
  foreign key (related_meeting, domain) references ai_core.meetings(id, domain),
  foreign key (related_project, domain) references ai_core.projects(id, domain)
);
create index if not exists brain_domain_status_idx on ai_core.brain_records (domain, status);

-- ---------- audit_log — append-only; every action attributable to a domain ----------
create table if not exists ai_core.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  domain      text not null,
  actor       text,
  action      text,
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists audit_domain_at_idx on ai_core.audit_log (domain, at desc);

-- APPEND-ONLY enforcement: reject UPDATE/DELETE for ALL roles (incl. the app's
-- service role). Emergency maintenance = a superuser/owner disables the trigger:
--   alter table ai_core.audit_log disable trigger user;   -- (then re-enable)
create or replace function ai_core.audit_append_only() returns trigger
  language plpgsql as $fn$
begin
  raise exception 'ai_core.audit_log is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end $fn$;
drop trigger if exists audit_log_no_update on ai_core.audit_log;
drop trigger if exists audit_log_no_delete on ai_core.audit_log;
create trigger audit_log_no_update before update on ai_core.audit_log
  for each row execute function ai_core.audit_append_only();
create trigger audit_log_no_delete before delete on ai_core.audit_log
  for each row execute function ai_core.audit_append_only();
-- belt-and-suspenders: never grant mutation on audit_log to the business role
revoke update, delete on ai_core.audit_log from authenticated;

-- ============================================================
--  RLS — domain boundary (P1 baseline; NOT the full permission engine)
--  service_role: full. authenticated (business staff): READ only domain='party_perfect'.
--  Personal domains stay service_role-only until an identity/allowed_domains layer.
--  Future (no core redesign): ai_core.actor_permissions + ai_core.can_access(domain).
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','meetings','artifacts','approvals','brain_records','audit_log'] loop
    execute format('alter table ai_core.%I enable row level security;', t);
    execute format('grant all on ai_core.%I to service_role;', t);
    execute format('drop policy if exists %I on ai_core.%I;', t||'_service_all', t);
    execute format('create policy %I on ai_core.%I for all to service_role using (true) with check (true);', t||'_service_all', t);
    execute format('grant select on ai_core.%I to authenticated;', t);
    execute format('drop policy if exists %I on ai_core.%I;', t||'_biz_read', t);
    execute format($p$create policy %I on ai_core.%I for select to authenticated using (domain = 'party_perfect');$p$, t||'_biz_read', t);
  end loop;
end $$;

comment on schema ai_core is 'Mershon AI Core: neutral shared contract, domain-tagged. Personas (Mike/Matter) are app-layer. Cross-domain integrity via composite FKs (id,domain). audit_log append-only (trigger). Personal domains service_role-only until an identity layer. Identity governs domain access; client-supplied domain is never authorization.';
