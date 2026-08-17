-- ============================================================
--  PP-TIME-001 — Party Perfect Time (employee clock + payroll review)
--  HELD. Do NOT apply until Mason approves this migration AND
--  verifies PP Showroom lat/long. No live punches before that.
--  Never apply 0001/0002 (POR) with this file.
--  No secrets, PINs in plaintext, wages, or customer PII.
-- ============================================================

create schema if not exists pp_time;

create table if not exists pp_time.employees (
  id                  text primary key,
  employee_number     text not null unique,
  preferred_name      text not null,
  first_name          text not null,
  last_name           text not null,
  phone_last4         text,
  active              boolean not null default true,
  department          text not null default '',
  title               text not null default '',
  pin_hash            text not null,
  capabilities        text[] not null default array['punch','self_history','self_request']::text[],
  pto_eligible        boolean not null default false,
  vacation_eligible   boolean not null default false,
  onboarding_status   text not null default 'invited',
  start_date          date,
  notes               text not null default '',
  credentials_version integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table pp_time.employees is
  'Timekeeping roster. pin_hash only — never store plaintext PINs. credentials_version invalidates sessions on PIN/device reset. Capabilities are flags, not hard-coded names. employee_number is internal; login is First+Last+PIN.';

create table if not exists pp_time.work_locations (
  id          text primary key,
  name        text not null,
  address     text not null default '',
  latitude    double precision,
  longitude   double precision,
  radius_m    integer not null default 150,
  active      boolean not null default false,
  verified    boolean not null default false,
  notes       text not null default ''
);

insert into pp_time.work_locations (
  id, name, address, latitude, longitude, radius_m, active, verified, notes
) values (
  'loc-showroom',
  'PP Showroom',
  '8401 E 41st St, Tulsa OK 74145',
  null,
  null,
  150,
  false,
  false,
  'UNVERIFIED coords optional for distance signals. Off-site punches allowed; GPS/IP/device are review evidence.'
) on conflict (id) do nothing;

create table if not exists pp_time.trusted_devices (
  id               text primary key,
  employee_id      text not null references pp_time.employees(id),
  label            text,
  platform_hint    text,
  first_seen_at    timestamptz not null,
  last_seen_at     timestamptz not null,
  active           boolean not null default true,
  revoked_at       timestamptz
);
create index if not exists trusted_devices_employee_idx
  on pp_time.trusted_devices (employee_id, last_seen_at desc);

create table if not exists pp_time.punch_events (
  id                        uuid primary key default gen_random_uuid(),
  employee_id               text not null references pp_time.employees(id),
  type                      text not null check (type in ('clock_in','lunch_start','lunch_end','clock_out')),
  occurred_at               timestamptz not null,
  ingested_at               timestamptz not null default now(),
  timezone                  text not null default 'America/Chicago',
  client_reported_at        timestamptz,
  latitude                  double precision,
  longitude                 double precision,
  accuracy_m                double precision,
  gps_captured_at           timestamptz,
  gps_permission            text not null default 'unavailable',
  location_id               text references pp_time.work_locations(id),
  nearest_location_id       text references pp_time.work_locations(id),
  nearest_location_name     text,
  distance_from_nearest_m   double precision,
  geofence_ok               boolean not null default false,
  geofence_reason           text,
  client_ip                 text,
  network_class             text not null default 'UNKNOWN'
                            check (network_class in ('PARTY_PERFECT_NETWORK','OTHER_NETWORK','UNKNOWN')),
  office_network_match      boolean,
  trusted_device_id         text references pp_time.trusted_devices(id),
  trusted_device            boolean not null default false,
  new_device                 boolean not null default false,
  unusual_ip                boolean not null default false,
  unusual_location          boolean not null default false,
  risk_score                integer not null default 0,
  review_required           boolean not null default false,
  reason_codes              text[] not null default '{}',
  reviewed_at               timestamptz,
  reviewed_by               text,
  source                    text not null check (source in ('app','import','admin_correction','system_safety_close')),
  idempotency_key           text not null unique,
  shift_id                  text,
  device_hint               text
);
create index if not exists punch_events_employee_idx
  on pp_time.punch_events (employee_id, occurred_at desc);
create index if not exists punch_events_review_idx
  on pp_time.punch_events (review_required, occurred_at desc)
  where review_required = true and reviewed_at is null;

-- Retention: raw IP/GPS/device evidence default 365 days (PUNCH_EVIDENCE_RETENTION_DAYS).
-- Admins must not keep forever by accident; purge jobs are a follow-on.

create table if not exists pp_time.shifts (
  id                         text primary key,
  employee_id                text not null references pp_time.employees(id),
  start_at                   timestamptz not null,
  end_at                     timestamptz,
  lunch_start_at             timestamptz,
  lunch_end_at               timestamptz,
  status                     text not null check (status in ('open','on_lunch','closed','exception','pending_correction')),
  paid_seconds               integer,
  lunch_seconds              integer,
  source                     text not null,
  pay_period_id              text,
  imported_regular_hours     numeric(10,4),
  imported_overtime_hours    numeric(10,4),
  imported_doubletime_hours  numeric(10,4),
  close_kind                 text not null default 'none'
                             check (close_kind in ('none','employee','admin','system_pending_correction')),
  hours_authority            text not null default 'EMPLOYEE_CONFIRMED'
                             check (hours_authority in ('EMPLOYEE_CONFIRMED','ADMIN_APPROVED','SYSTEM_ESTIMATED','PENDING_CORRECTION')),
  safety_closed_at           timestamptz,
  safety_close_rule          text,
  employee_correction_id     text
);

create table if not exists pp_time.time_settings (
  id                                    text primary key default 'default',
  max_open_shift_hours                  integer not null default 16,
  overnight_safety_check_hour_chicago   integer not null default 4
);
insert into pp_time.time_settings (id) values ('default') on conflict (id) do nothing;
create index if not exists shifts_employee_idx
  on pp_time.shifts (employee_id, start_at desc);

create table if not exists pp_time.time_corrections (
  id                     text primary key,
  employee_id            text not null references pp_time.employees(id),
  shift_id               text,
  punch_id               text,
  affected_date          date not null,
  issue_type             text not null,
  requested_correction   text not null,
  employee_explanation   text not null,
  admin_remark           text not null default '',
  approved_correction    text not null default '',
  state                  text not null check (state in ('pending','needs_clarification','approved','denied')),
  queue                  text not null default 'shelly' check (queue in ('shelly','michelle')),
  decided_by             text,
  decided_at             timestamptz,
  original_snapshot      text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table pp_time.time_corrections is
  'Employees never edit official punches. Requests route to Shelly first. Preserve original + employee note + Shelly remark + approved correction + auditor.';

create table if not exists pp_time.absences (
  id                   text primary key,
  employee_id          text not null references pp_time.employees(id),
  start_date           date not null,
  end_date             date not null,
  reason               text not null,
  admin_class          text not null default 'unclassified',
  paid                 boolean not null default false,
  leave_hours_applied  numeric(10,2),
  employee_note        text not null default '',
  manager_remark       text not null default '',
  state                text not null check (state in ('pending','needs_clarification','approved','denied')),
  queue                text not null default 'shelly' check (queue in ('shelly','michelle')),
  decided_by           text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table pp_time.absences is
  'Employee absence report uses simple reasons. Paid-leave classification is Shelly/Michelle administrative — not automatic PTO.';

create table if not exists pp_time.time_off_requests (
  id               text primary key,
  employee_id      text not null references pp_time.employees(id),
  start_date       date not null,
  end_date         date not null,
  reason           text not null,
  employee_note    text not null default '',
  manager_remark   text not null default '',
  state            text not null check (state in ('pending','needs_clarification','approved','denied')),
  queue            text not null default 'shelly' check (queue in ('shelly','michelle')),
  decided_by       text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table pp_time.time_off_requests is
  'Future planned time-off. Architected in V1; full notify UX can mature after core clocking.';

create table if not exists pp_time.request_messages (
  id             text primary key,
  request_kind   text not null check (request_kind in ('correction','absence','time_off')),
  request_id     text not null,
  author_role    text not null check (author_role in ('employee','shelly','michelle','system')),
  author_id      text not null,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists request_messages_req_idx
  on pp_time.request_messages (request_kind, request_id, created_at);

create table if not exists pp_time.notifications (
  id             text primary key,
  employee_id    text not null references pp_time.employees(id),
  title          text not null,
  body           text not null default '',
  request_kind   text,
  request_id     text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_employee_idx
  on pp_time.notifications (employee_id, created_at desc);

create table if not exists pp_time.leave_banks (
  id             text primary key,
  employee_id    text not null references pp_time.employees(id),
  type           text not null check (type in ('pto','vacation')),
  granted_hours  numeric(10,2) not null default 0,
  used_hours     numeric(10,2) not null default 0,
  unique (employee_id, type)
);

create table if not exists pp_time.leave_transactions (
  id             text primary key,
  bank_id        text not null references pp_time.leave_banks(id),
  employee_id    text not null,
  type           text not null check (type in ('pto','vacation')),
  delta_hours    numeric(10,2) not null,
  reason         text not null default '',
  approved_by    text,
  at             timestamptz not null default now()
);

create table if not exists pp_time.schedules (
  id            text primary key,
  employee_id   text not null references pp_time.employees(id),
  location_id   text,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  department    text not null default ''
);
comment on table pp_time.schedules is
  'Stub for future tardy logic. V1 does not auto-flag tardy from schedules.';

create table if not exists pp_time.pay_periods (
  id            text primary key,
  start_date    date not null,
  end_date      date not null,
  status        text not null check (status in ('open','review','finalized')),
  finalized_by  text,
  finalized_at  timestamptz
);

create table if not exists pp_time.audit_log (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  target  text not null,
  detail  text not null default ''
);
comment on table pp_time.audit_log is
  'Immutable payroll-impacting change log. Append only.';

create table if not exists pp_time.square_import_runs (
  id           text primary key,
  file_hash    text not null,
  file_name    text not null,
  dry_run      boolean not null default true,
  committed    boolean not null default false,
  created_at   timestamptz not null default now(),
  result_json  jsonb not null default '{}'::jsonb
);

-- RLS: service_role write. Authenticated employees have no direct table access.
do $$
declare t text;
begin
  foreach t in array array[
    'employees','work_locations','trusted_devices','punch_events','shifts','time_settings','time_corrections',
    'absences','time_off_requests','request_messages','notifications',
    'leave_banks','leave_transactions','schedules','pay_periods',
    'audit_log','square_import_runs'
  ] loop
    execute format('alter table pp_time.%I enable row level security;', t);
    execute format('grant all on table pp_time.%I to service_role;', t);
    execute format('revoke all on table pp_time.%I from authenticated;', t);
    execute format('revoke all on table pp_time.%I from anon;', t);
    execute format('drop policy if exists %I on pp_time.%I;', t||'_service_all', t);
    execute format(
      'create policy %I on pp_time.%I for all to service_role using (true) with check (true);',
      t||'_service_all', t
    );
  end loop;
end $$;

revoke all on schema pp_time from authenticated, anon;
grant usage on schema pp_time to service_role;
grant all on all tables in schema pp_time to service_role;
