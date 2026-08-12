#!/usr/bin/env node
/**
 * Bootstrap POR brain CSVs → Supabase Postgres (por.*).
 *
 *   node --env-file=.env.local scripts/ingest-por-supabase.mjs
 *
 * Mapping: supabase/README.md (with CNUM→customers.key for CUSN joins).
 * NEVER imports Encrypted/EncryptedCard/CCAlias or CheckCardFile.
 *
 * Env: DATABASE_URL (Supabase Postgres; prefer pooler session mode for bulk load)
 *      POR_EXPORT_DIR (optional)
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import pg from "pg";

const DEFAULT_EXPORT =
  "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA";

const exportDir = resolve(process.env.POR_EXPORT_DIR?.trim() || DEFAULT_EXPORT);
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("Missing DATABASE_URL (Supabase Postgres connection string).");
  process.exit(1);
}
if (!existsSync(exportDir)) {
  console.error(`Export dir not found: ${exportDir}`);
  process.exit(1);
}

console.log("Policy: will NOT ingest CheckCardFile or PaymentFile card fields.");

const BATCH = 500;
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 0,
});
await client.connect();

function normalizeId(value) {
  return String(value ?? "")
    .trim()
    .replace(/^0+(?=\d)/, "");
}

function asNum(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function asInt(value) {
  const n = asNum(value);
  return n == null ? null : Math.trunc(n);
}

function asBool(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function str(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function parsePorDate(value) {
  const s = str(value);
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function* streamCsv(filePath) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers = null;
  let first = true;
  let buf = "";
  for await (const raw of rl) {
    let line = raw;
    if (first) {
      line = line.replace(/^\uFEFF/, "");
      first = false;
    }
    buf = buf ? `${buf}\n${line}` : line;
    let inQuotes = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === '"') {
        if (inQuotes && buf[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = !inQuotes;
      }
    }
    if (inQuotes) continue;
    const record = buf;
    buf = "";
    if (!record.trim()) continue;
    const cols = parseCsvLine(record);
    if (!headers) {
      headers = cols.map((h) => h.replace(/^"|"$/g, "").trim());
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";
    yield row;
  }
}

async function upsertBatch(sql, rows) {
  if (!rows.length) return;
  await client.query("BEGIN");
  try {
    for (const params of rows) {
      await client.query(sql, params);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

const counts = {
  salesmen: 0,
  customers: 0,
  contracts: 0,
  contract_items: 0,
  payments: 0,
  items: 0,
};

// Run core + RLS migrations if tables missing
async function ensureSchema() {
  const { rows } = await client.query(
    `select to_regclass('por.customers') as t`,
  );
  if (rows[0]?.t) {
    console.log("Schema por.* already present.");
    return;
  }
  console.log("Applying migrations 0001 + 0002…");
  const root = resolve(import.meta.dirname, "..");
  for (const file of [
    "supabase/migrations/0001_por_core.sql",
    "supabase/migrations/0002_por_rls.sql",
  ]) {
    const sql = readFileSync(resolve(root, file), "utf8");
    await client.query(sql);
    console.log(`  applied ${file}`);
  }
}

await ensureSchema();

// ——— salesmen ———
{
  const file = resolve(exportDir, "Salesman.csv");
  if (existsSync(file)) {
    console.log("Loading Salesman…");
    const sql = `insert into por.salesmen (number, name, inactive, email, imported_at)
      values ($1,$2,$3,$4,now())
      on conflict (number) do update set
        name=excluded.name, inactive=excluded.inactive, email=excluded.email, imported_at=now()`;
    let batch = [];
    for await (const row of streamCsv(file)) {
      const number = asInt(row.Number);
      if (number == null) continue;
      batch.push([number, str(row.Name), asBool(row.Inactive), str(row.Email)]);
      counts.salesmen++;
      if (batch.length >= BATCH) {
        await upsertBatch(sql, batch);
        batch = [];
      }
    }
    await upsertBatch(sql, batch);
    console.log(`Salesmen: ${counts.salesmen}`);
  } else {
    console.log("Salesman.csv missing — skip");
  }
}

// ——— customers (key = CNUM) ———
{
  const file = resolve(exportDir, "CustomerFile.csv");
  console.log("Loading CustomerFile…");
  const sql = `insert into por.customers (
      key, alt_key, name, company, address, address2, city, zip,
      phone, work_phone, mobile, email, type, status, salesman,
      open_date, last_active, last_contract, number_contracts,
      current_balance, no_email, imported_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,$21,now()
    )
    on conflict (key) do update set
      alt_key=excluded.alt_key, name=excluded.name, company=excluded.company,
      address=excluded.address, address2=excluded.address2, city=excluded.city,
      zip=excluded.zip, phone=excluded.phone, work_phone=excluded.work_phone,
      mobile=excluded.mobile, email=excluded.email, type=excluded.type,
      status=excluded.status, salesman=excluded.salesman, open_date=excluded.open_date,
      last_active=excluded.last_active, last_contract=excluded.last_contract,
      number_contracts=excluded.number_contracts, current_balance=excluded.current_balance,
      no_email=excluded.no_email, imported_at=now()`;
  let batch = [];
  for await (const row of streamCsv(file)) {
    const key = normalizeId(row.CNUM);
    if (!key) continue;
    const alt = str(row.KEY);
    batch.push([
      key,
      alt && normalizeId(alt) !== key ? alt : null,
      str(row.NAME),
      str(row.NameAlias),
      str(row.Address),
      str(row.Address2),
      str(row.CITY),
      str(row.ZIP),
      str(row.Phone),
      str(row.WORK),
      str(row.MOBILE),
      str(row.Email),
      str(row.Type),
      str(row.Status),
      asInt(row.Salesman),
      parsePorDate(row.OpenDate),
      parsePorDate(row.LastActive),
      str(row.LastContract),
      asInt(row.NumberContracts),
      asNum(row.CurrentBalance),
      asBool(row.NoEmail),
    ]);
    counts.customers++;
    if (batch.length >= BATCH) {
      await upsertBatch(sql, batch);
      batch = [];
      if (counts.customers % 2000 === 0) console.log(`  customers ${counts.customers}`);
    }
  }
  await upsertBatch(sql, batch);
  console.log(`Customers: ${counts.customers}`);
}

// ——— items ———
{
  const file = resolve(exportDir, "ItemFile.csv");
  console.log("Loading ItemFile…");
  const sql = `insert into por.items (
      num, key, name, category, qty, qty_out, rate1, sell, inactive, imported_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    on conflict (num) do update set
      key=excluded.key, name=excluded.name, category=excluded.category,
      qty=excluded.qty, qty_out=excluded.qty_out, rate1=excluded.rate1,
      sell=excluded.sell, inactive=excluded.inactive, imported_at=now()`;
  let batch = [];
  for await (const row of streamCsv(file)) {
    const num = normalizeId(row.NUM);
    const key = str(row.KEY);
    if (!num || !key) continue;
    batch.push([
      num,
      key,
      str(row.Name),
      str(row.Category),
      asNum(row.QTY),
      asNum(row.QYOT),
      asNum(row.RATE1),
      asNum(row.SELL),
      asBool(row.Inactive),
    ]);
    counts.items++;
    if (batch.length >= BATCH) {
      await upsertBatch(sql, batch);
      batch = [];
    }
  }
  await upsertBatch(sql, batch);
  console.log(`Items: ${counts.items}`);
}

// ——— contracts ———
{
  const file = resolve(exportDir, "Transactions.csv");
  console.log("Loading Transactions…");
  const sql = `insert into por.contracts (
      cntr, txn_date, status, status_desc, customer_key, salesman,
      rent, sale, damage_waiver, other, tax, total, paid,
      delivery_date, pickup_date, event_end_date,
      delivery_address, delivery_city, delivery_zip,
      contact, contact_phone, cancelled, archived, notes, imported_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,$23,$24,now()
    )
    on conflict (cntr) do update set
      txn_date=excluded.txn_date, status=excluded.status, status_desc=excluded.status_desc,
      customer_key=excluded.customer_key, salesman=excluded.salesman,
      rent=excluded.rent, sale=excluded.sale, damage_waiver=excluded.damage_waiver,
      other=excluded.other, tax=excluded.tax, total=excluded.total, paid=excluded.paid,
      delivery_date=excluded.delivery_date, pickup_date=excluded.pickup_date,
      event_end_date=excluded.event_end_date, delivery_address=excluded.delivery_address,
      delivery_city=excluded.delivery_city, delivery_zip=excluded.delivery_zip,
      contact=excluded.contact, contact_phone=excluded.contact_phone,
      cancelled=excluded.cancelled, archived=excluded.archived, notes=excluded.notes,
      imported_at=now()`;
  let batch = [];
  for await (const row of streamCsv(file)) {
    const cntr = normalizeId(row.CNTR);
    const customer_key = normalizeId(row.CUSN);
    if (!cntr || !customer_key) continue;
    const status = str(row.Status) || str(row.STAT);
    batch.push([
      cntr,
      parsePorDate(row.DATE),
      status,
      null,
      customer_key,
      asInt(row.Salesman),
      asNum(row.RENT),
      asNum(row.SALE),
      asNum(row.DMG),
      asNum(row.OTHR),
      asNum(row.TAX),
      asNum(row.TOTL),
      asNum(row.PAID),
      parsePorDate(row.DeliveryDate),
      parsePorDate(row.PickupDate),
      parsePorDate(row.EventEndDate),
      str(row.DeliveryAddress),
      str(row.DeliveryCity),
      str(row.DeliveryZip),
      str(row.Contact),
      str(row.ContactPhone),
      asBool(row.Cancelled),
      asBool(row.Archived),
      str(row.DeliveryNotes),
    ]);
    counts.contracts++;
    if (batch.length >= BATCH) {
      await upsertBatch(sql, batch);
      batch = [];
      if (counts.contracts % 10000 === 0) {
        console.log(`  contracts ${counts.contracts}`);
      }
    }
  }
  await upsertBatch(sql, batch);
  console.log(`Contracts: ${counts.contracts}`);
}

// ——— contract items ———
{
  const file = resolve(exportDir, "TransactionItems.csv");
  console.log("Loading TransactionItems…");
  const sql = `insert into por.contract_items (
      id, cntr, item, qty, price, description, daily_amount, weekly_amount,
      monthly_amount, discount_amount, tax_amount, out_date, line_number
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (id) do update set
      cntr=excluded.cntr, item=excluded.item, qty=excluded.qty, price=excluded.price,
      description=excluded.description, daily_amount=excluded.daily_amount,
      weekly_amount=excluded.weekly_amount, monthly_amount=excluded.monthly_amount,
      discount_amount=excluded.discount_amount, tax_amount=excluded.tax_amount,
      out_date=excluded.out_date, line_number=excluded.line_number`;
  let batch = [];
  for await (const row of streamCsv(file)) {
    const cntr = normalizeId(row.CNTR);
    const item = normalizeId(row.ITEM);
    const id = str(row.Id) || (cntr && item ? `${cntr}:${row.LineNumber || counts.contract_items}` : null);
    if (!id || !cntr) continue;
    batch.push([
      id,
      cntr,
      item,
      asNum(row.QTY),
      asNum(row.PRIC),
      str(row.Desc),
      asNum(row.DailyAmount),
      asNum(row.WeeklyAmount),
      asNum(row.MonthlyAmount),
      asNum(row.DiscountAmount),
      asNum(row.TaxAmount),
      parsePorDate(row.OutDate),
      asInt(row.LineNumber),
    ]);
    counts.contract_items++;
    if (batch.length >= BATCH) {
      await upsertBatch(sql, batch);
      batch = [];
      if (counts.contract_items % 50000 === 0) {
        console.log(`  contract_items ${counts.contract_items}`);
      }
    }
  }
  await upsertBatch(sql, batch);
  console.log(`Contract items: ${counts.contract_items}`);
}

// ——— payments (NO card fields) ———
{
  const file = resolve(exportDir, "PaymentFile.csv");
  console.log("Loading PaymentFile (card fields omitted)…");
  const sql = `insert into por.payments (
      payment, pay_date, customer_key, cntr, amount, method, type, ref_no, notes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (payment) do update set
      pay_date=excluded.pay_date, customer_key=excluded.customer_key, cntr=excluded.cntr,
      amount=excluded.amount, method=excluded.method, type=excluded.type,
      ref_no=excluded.ref_no, notes=excluded.notes`;
  let batch = [];
  for await (const row of streamCsv(file)) {
    const payment = normalizeId(row.Payment);
    if (!payment) continue;
    // Explicitly ignore Encrypted, EncryptedCard, CCAlias
    batch.push([
      payment,
      parsePorDate(row.Date),
      normalizeId(row.CustNumb) || null,
      normalizeId(row.TransID) || null,
      asNum(row.Amount),
      str(row.Meth),
      str(row.Type),
      str(row.RefNo),
      str(row.Notes),
    ]);
    counts.payments++;
    if (batch.length >= BATCH) {
      await upsertBatch(sql, batch);
      batch = [];
    }
  }
  await upsertBatch(sql, batch);
  console.log(`Payments: ${counts.payments}`);
}

await client.query(`
  create table if not exists por.sync_meta (
    id text primary key default 'default',
    synced_at timestamptz not null default now(),
    source text,
    counts jsonb
  );
  insert into por.sync_meta (id, synced_at, source, counts)
  values ('default', now(), $1, $2::jsonb)
  on conflict (id) do update set synced_at=now(), source=excluded.source, counts=excluded.counts
`, [`CSV bootstrap ${exportDir}`, JSON.stringify(counts)]);

await client.end();
console.log("Done.", counts);
