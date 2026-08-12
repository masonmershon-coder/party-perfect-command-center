-- ============================================================
--  Party Perfect — POR core mirror (Supabase / Postgres)
--  Read model of Point of Rental. POR stays system of record;
--  this is the operational mirror the Command Center reads.
--  Bootstrapped from the brain CSV export; kept live by the
--  por-sync-agent (read-only, Server=ENTERPRISE,9676, DB=POR).
--
--  SECURITY: NO card data lives here. PaymentFile.Encrypted /
--  EncryptedCard / CCAlias and CheckCardFile are NEVER imported.
--  customers.current_balance + contract $ are OWNER-ONLY at the
--  app layer (gate with OWNER_PIN, never expose to employee role).
-- ============================================================

create schema if not exists por;

-- --- salespeople (Salesman.csv) ---
create table if not exists por.salesmen (
  number      int primary key,
  name        text,
  inactive    boolean,
  email       text,
  imported_at timestamptz not null default now()
);

-- --- customers (CustomerFile.csv)
-- PK `key` = trimmed CNUM (joins Transactions.CUSN). CSV KEY (often phone) → alt_key.
create table if not exists por.customers (
  key              text primary key,  -- CNUM
  alt_key          text,              -- CustomerFile.KEY when distinct
  name             text,
  first_name       text,
  last_name        text,
  company          text,           -- NameAlias
  address          text,
  address2         text,
  city             text,
  zip              text,
  phone            text,
  work_phone       text,
  mobile           text,
  email            text,
  type             text,
  status           text,
  salesman         int,            -- -> salesmen.number
  open_date        timestamptz,
  last_active      timestamptz,
  last_contract    text,
  number_contracts int,
  current_balance  numeric(14,2),  -- OWNER-ONLY
  no_email         boolean,
  imported_at      timestamptz not null default now()
);
create index if not exists customers_name_idx     on por.customers using gin (to_tsvector('simple', coalesce(name,'')));
create index if not exists customers_salesman_idx on por.customers (salesman);

-- --- contracts / quotes / reservations (Transactions.csv; PK = CNTR) ---
create table if not exists por.contracts (
  cntr             text primary key,
  txn_date         timestamptz,    -- DATE (event/out date)
  created_date     timestamptz,
  status           text,           -- Q=quote, R/O=reserved/out, D=done, C=cancelled
  status_desc      text,
  customer_key     text,           -- CUSN -> customers.key
  salesman         int,            -- -> salesmen.number
  rent             numeric(14,2),
  sale             numeric(14,2),
  damage_waiver    numeric(14,2),
  other            numeric(14,2),
  tax              numeric(14,2),
  total            numeric(14,2),
  paid             numeric(14,2),
  delivery_date    timestamptz,
  pickup_date      timestamptz,
  event_end_date   timestamptz,
  delivery_address text,
  delivery_city    text,
  delivery_zip     text,
  contact          text,
  contact_phone    text,
  cancelled        boolean,
  archived         boolean,
  notes            text,
  imported_at      timestamptz not null default now()
);
create index if not exists contracts_customer_idx on por.contracts (customer_key);
create index if not exists contracts_date_idx     on por.contracts (txn_date);
create index if not exists contracts_status_idx   on por.contracts (status);
create index if not exists contracts_salesman_idx on por.contracts (salesman);

-- --- line items (TransactionItems.csv; PK = Id — POR composite string, not bigint) ---
create table if not exists por.contract_items (
  id             text primary key,
  cntr           text,            -- -> contracts.cntr
  item           text,            -- ITEM -> items.num
  qty            numeric(14,2),
  price          numeric(14,2),
  description    text,
  daily_amount   numeric(14,2),
  weekly_amount  numeric(14,2),
  monthly_amount numeric(14,2),
  discount_amount numeric(14,2),
  tax_amount     numeric(14,2),
  out_date       timestamptz,
  line_number    int
);
create index if not exists items_cntr_idx on por.contract_items (cntr);
create index if not exists items_item_idx on por.contract_items (item);

-- --- payments (PaymentFile.csv; PK = Payment) — NO card ciphertext ---
create table if not exists por.payments (
  payment      text primary key,
  pay_date     timestamptz,
  customer_key text,             -- CustNumb -> customers.key
  cntr         text,             -- TransID -> contracts.cntr (when present)
  amount       numeric(14,2),
  method       text,             -- Meth
  type         text,
  ref_no       text,
  notes        text
  -- Encrypted / EncryptedCard / CCAlias intentionally NOT stored (PCI)
);
create index if not exists payments_customer_idx on por.payments (customer_key);
create index if not exists payments_cntr_idx     on por.payments (cntr);

-- --- inventory (ItemFile.csv; PK = NUM, the availability join key) ---
create table if not exists por.items (
  num         text primary key,
  key         text,
  name        text,
  category    text,
  qty         numeric(14,2),
  qty_out     numeric(14,2),
  rate1       numeric(14,2),
  sell        numeric(14,2),
  inactive    boolean,
  imported_at timestamptz not null default now()
);
create index if not exists items_category_idx on por.items (category);
