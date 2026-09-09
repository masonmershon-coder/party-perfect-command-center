-- AI CORE autonomy Day 1: durable idempotent task intake.
-- Non-production migration. Apply only after owner review and explicit migration approval.
--
-- A client retry, network timeout, or worker restart must not create a second
-- canonical task. The key is scoped by domain so personal and business domains
-- cannot collide.

alter table ai_core.tasks
  add column if not exists idempotency_key text;

create unique index if not exists tasks_domain_idempotency_key_ux
  on ai_core.tasks (domain, idempotency_key)
  where idempotency_key is not null;

comment on column ai_core.tasks.idempotency_key is
  'Caller-generated stable key for one intended task intake; scoped by domain and never reused for a different effect.';
