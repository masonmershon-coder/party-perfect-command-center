-- ============================================================
--  Party Perfect — POR mirror RLS (employee vs owner)
--  App still gates with OWNER_PIN; this is defense-in-depth.
--
--  Roles:
--    authenticated  — Command Center staff (maps to employee)
--    service_role   — server sync/loader (full access; never exposed to browser)
--    anon           — no access to por.*
--
--  App uses DATABASE_URL as the Postgres role (typically postgres or
--  a custom role). For PostgREST / future client access, employees use
--  authenticated JWT without claim app_role=owner; owners set
--  request.jwt.claims ->> 'app_role' = 'owner'.
-- ============================================================

-- Ensure privileges: schema usable by authenticated; service_role full.
grant usage on schema por to authenticated, service_role;
grant select on all tables in schema por to authenticated;
grant all on all tables in schema por to service_role;
alter default privileges in schema por
  grant select on tables to authenticated;
alter default privileges in schema por
  grant all on tables to service_role;

-- Helper: true when JWT claims owner (Command Center owner session).
create or replace function por.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role',
    ''
  ) = 'owner'
  or coalesce(
    nullif(current_setting('app.role', true), ''),
    ''
  ) = 'owner';
$$;

revoke all on function por.is_owner() from public;
grant execute on function por.is_owner() to authenticated, service_role;

-- Enable RLS on all por tables
alter table por.salesmen enable row level security;
alter table por.customers enable row level security;
alter table por.contracts enable row level security;
alter table por.contract_items enable row level security;
alter table por.payments enable row level security;
alter table por.items enable row level security;

-- Drop old policies if re-running
drop policy if exists por_salesmen_select on por.salesmen;
drop policy if exists por_customers_select on por.customers;
drop policy if exists por_contracts_select on por.contracts;
drop policy if exists por_contract_items_select on por.contract_items;
drop policy if exists por_payments_select on por.payments;
drop policy if exists por_items_select on por.items;
drop policy if exists por_service_all_salesmen on por.salesmen;
drop policy if exists por_service_all_customers on por.customers;
drop policy if exists por_service_all_contracts on por.contracts;
drop policy if exists por_service_all_contract_items on por.contract_items;
drop policy if exists por_service_all_payments on por.payments;
drop policy if exists por_service_all_items on por.items;

-- Staff can read operational rows (money columns still filtered in app /
-- and via column grants below where possible).
create policy por_salesmen_select on por.salesmen
  for select to authenticated using (true);

create policy por_customers_select on por.customers
  for select to authenticated using (true);

create policy por_contracts_select on por.contracts
  for select to authenticated using (true);

create policy por_contract_items_select on por.contract_items
  for select to authenticated using (true);

-- Payments are owner-only at RLS (employee never sees payment rows).
create policy por_payments_select on por.payments
  for select to authenticated using (por.is_owner());

create policy por_items_select on por.items
  for select to authenticated using (true);

-- service_role bypasses RLS by default in Supabase, but explicit ALL policies
-- keep intent clear if that ever changes.
create policy por_service_all_salesmen on por.salesmen
  for all to service_role using (true) with check (true);
create policy por_service_all_customers on por.customers
  for all to service_role using (true) with check (true);
create policy por_service_all_contracts on por.contracts
  for all to service_role using (true) with check (true);
create policy por_service_all_contract_items on por.contract_items
  for all to service_role using (true) with check (true);
create policy por_service_all_payments on por.payments
  for all to service_role using (true) with check (true);
create policy por_service_all_items on por.items
  for all to service_role using (true) with check (true);

-- Column-level: hide financial columns from authenticated (employee path).
-- Owners using the Node pool (postgres/service) still see them; app gates too.
revoke select on por.customers from authenticated;
grant select (
  key, alt_key, name, first_name, last_name, company, address, address2, city, zip,
  phone, work_phone, mobile, email, type, status, salesman, open_date,
  last_active, last_contract, number_contracts, no_email, imported_at
) on por.customers to authenticated;

revoke select on por.contracts from authenticated;
grant select (
  cntr, txn_date, created_date, status, status_desc, customer_key, salesman,
  delivery_date, pickup_date, event_end_date, delivery_address, delivery_city,
  delivery_zip, contact, contact_phone, cancelled, archived, notes, imported_at
) on por.contracts to authenticated;

-- Items: hide rate/sell from authenticated (owner sees via service/app).
revoke select on por.items from authenticated;
grant select (
  num, key, name, category, qty, qty_out, inactive, imported_at
) on por.items to authenticated;

-- contract_items: hide price/amounts from authenticated
revoke select on por.contract_items from authenticated;
grant select (
  id, cntr, item, qty, description, out_date, line_number
) on por.contract_items to authenticated;

comment on schema por is 'Read-only POR mirror. No card data. Financials owner-gated (RLS + app).';
