#!/usr/bin/env node
/**
 * Bootstrap full POR CRM export → Redis entity keys + catalog/reservations.
 *
 *   node --env-file=.env.local scripts/ingest-por-full.mjs
 *
 * Env:
 *   POR_EXPORT_DIR — default NAS path for 2026-08-10_POR-FULL-DATA
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_*)
 *
 * Never ingests CheckCardFile. Strips PaymentFile Encrypted/EncryptedCard/CCAlias.
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { Redis } from "@upstash/redis";

const DEFAULT_EXPORT =
  "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA";

const exportDir = resolve(process.env.POR_EXPORT_DIR?.trim() || DEFAULT_EXPORT);

const url =
  process.env.UPSTASH_REDIS_REST_URL?.trim() ||
  process.env.KV_REST_API_URL?.trim();
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
  process.env.KV_REST_API_TOKEN?.trim();

if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}

if (!existsSync(exportDir)) {
  console.error(`Export dir not found: ${exportDir}`);
  process.exit(1);
}

const FORBIDDEN = ["CheckCardFile.csv", "CheckCardFile"];
for (const f of FORBIDDEN) {
  // We intentionally never open CheckCardFile even if present.
  if (f.endsWith(".csv")) {
    console.log(`Policy: will NOT ingest ${f} (excluded).`);
  }
}

const redis = new Redis({ url, token });
const BATCH = 100;
const REDIS_JSON_PREFIX = "pp:json:";
const REDIS_ALL_KEYS = "pp:all-keys";

function normalizeId(value) {
  return String(value ?? "")
    .trim()
    .replace(/^0+(?=\d)/, "");
}

function nameTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function asNum(value) {
  if (value == null || value === "") return undefined;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

function str(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

/** RFC4180-ish CSV line parser (handles quotes). */
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
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
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
  let inQuotes = false;

  for await (const raw of rl) {
    let line = raw;
    if (first) {
      line = line.replace(/^\uFEFF/, "");
      first = false;
    }

    if (buf) {
      buf += "\n" + line;
    } else {
      buf = line;
    }

    // Track quote state across the accumulated buffer
    inQuotes = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === '"') {
        if (inQuotes && buf[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = !inQuotes;
      }
    }
    if (inQuotes) continue; // wait for closing quote on a later line

    const record = buf;
    buf = "";
    if (!record.trim()) continue;
    const cols = parseCsvLine(record);
    if (!headers) {
      headers = cols.map((h) => h.replace(/^"|"$/g, "").trim());
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = cols[i] ?? "";
    }
    yield row;
  }
  if (buf.trim() && headers) {
    const cols = parseCsvLine(buf);
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = cols[i] ?? "";
    }
    yield row;
  }
}

async function flushPipeline(ops) {
  for (let i = 0; i < ops.length; i += BATCH) {
    const slice = ops.slice(i, i + BATCH);
    const p = redis.pipeline();
    for (const op of slice) op(p);
    await p.exec();
  }
}

function coerceCustomer(row) {
  const cnum = normalizeId(row.CNUM);
  const name = String(row.NAME || "").trim();
  if (!cnum || !name) return null;
  return {
    cnum,
    key: str(row.KEY),
    name,
    address: str(row.Address),
    address2: str(row.Address2),
    city: str(row.CITY),
    zip: str(row.ZIP),
    phone: str(row.Phone),
    work: str(row.WORK),
    mobile: str(row.MOBILE),
    email: str(row.Email),
    status: str(row.Status),
    type: str(row.Type),
    openDate: str(row.OpenDate),
    lastActive: str(row.LastActive),
    lastContract: str(row.LastContract),
    creditLimit: asNum(row.CreditLimit),
    currentBalance: asNum(row.CurrentBalance),
    highBalance: asNum(row.HighBalance),
    lastPayAmount: asNum(row.LastPayAmount),
    lastPayDate: str(row.LastPayDate),
    numberContracts: asNum(row.NumberContracts),
    salesman: str(row.Salesman),
    taxCode: str(row.TaxCode),
    billContact: str(row.BillContact),
    billPhone: str(row.BillPhone),
    message: str(row.Message),
  };
}

function coerceJobSite(row) {
  const cnum = normalizeId(row.Cnum || row.CNUM);
  if (!cnum) return null;
  return {
    number: str(row.Number),
    cnum,
    description: str(row.Description),
    contactName: str(row.ContactName),
    contactPhone: str(row.ContactPhone),
    siteAddress: str(row.SiteAddress),
    siteCity: str(row.SiteCity),
    siteZip: str(row.SiteZip),
    siteNotes: str(row.SiteNotes),
    poNumber: str(row.PONumber),
    jobNumber: str(row.JobNumber),
    projectStartDate: str(row.ProjectStartDate),
    projectEndDate: str(row.ProjectEndDate),
    siteDeliveryInstructions: str(row.SiteDeliveryInstructions),
  };
}

function coerceComment(row) {
  const cnum = normalizeId(row.CNUM);
  const comments = String(row.COMMENTS1 || "").trim();
  if (!cnum || !comments) return null;
  return { cnum, comments };
}

function coerceTx(row) {
  const cntr = normalizeId(row.CNTR);
  const cusn = normalizeId(row.CUSN);
  if (!cntr || !cusn) return null;
  return {
    cntr,
    cusn,
    date: str(row.DATE),
    time: str(row.TIME),
    stat: str(row.STAT),
    totl: asNum(row.TOTL),
    paid: asNum(row.PAID),
    rent: asNum(row.RENT),
    sale: asNum(row.SALE),
    tax: asNum(row.TAX),
    dpmt: asNum(row.DPMT),
    pymt: asNum(row.PYMT),
    deliveryDate: str(row.DeliveryDate),
    pickupDate: str(row.PickupDate),
    eventEndDate: str(row.EventEndDate),
    contact: str(row.Contact),
    contactPhone: str(row.ContactPhone),
    deliveryAddress: str(row.DeliveryAddress),
    deliveryCity: str(row.DeliveryCity),
    deliveryZip: str(row.DeliveryZip),
    jobSite: str(row.JobSite),
    deliveryNotes: str(row.DeliveryNotes),
    transactionType: str(row.TransactionType),
    salesman: str(row.Salesman),
    completed: str(row.Completed),
    billed: str(row.Billed),
  };
}

function coerceTxItem(row) {
  const cntr = normalizeId(row.CNTR);
  const item = normalizeId(row.ITEM);
  if (!cntr || !item) return null;
  return {
    cntr,
    item,
    qty: asNum(row.QTY) ?? 0,
    pric: asNum(row.PRIC),
    desc: str(row.Desc),
    comments: str(row.Comments),
    lineNumber: asNum(row.LineNumber),
    outDate: str(row.OutDate),
    taxAmount: asNum(row.TaxAmount),
    dailyAmount: asNum(row.DailyAmount),
  };
}

function coercePayment(row) {
  const payment = normalizeId(row.Payment);
  if (!payment) return null;
  // Explicitly omit Encrypted, EncryptedCard, CCAlias
  return {
    payment,
    date: str(row.Date),
    type: str(row.Type),
    custNumb: normalizeId(row.CustNumb) || undefined,
    amount: asNum(row.Amount),
    meth: str(row.Meth),
    refNo: str(row.RefNo),
    notes: str(row.Notes),
    tendered: asNum(row.Tendered),
    transType: str(row.TransType),
  };
}

function coercePayDetail(row) {
  const payment = normalizeId(row.Payment);
  const contract = normalizeId(row.Contract);
  if (!payment || !contract) return null;
  return {
    payment,
    contract,
    amount: asNum(row.Amount),
    discount: asNum(row.Discount),
  };
}

function coerceItem(row) {
  const key = String(row.KEY || "").trim();
  const num = normalizeId(row.NUM);
  const name = String(row.Name || "").trim();
  if (!key || !num || !name) return null;
  return {
    key,
    num,
    name,
    loc: str(row.LOC),
    qty: asNum(row.QTY),
    qyot: asNum(row.QYOT),
    category: str(row.Category),
    type: str(row.TYPE),
    rate1: asNum(row.RATE1),
    sell: asNum(row.SELL),
    partNumber: str(row.PartNumber),
  };
}

function parsePorDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms);
  // M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return null;
}

function toISODate(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

const counts = {
  customers: 0,
  jobSites: 0,
  comments: 0,
  transactions: 0,
  transactionItems: 0,
  payments: 0,
  paymentDetails: 0,
  items: 0,
};

console.log(`Ingest from ${exportDir}`);

// ——— Customers ———
{
  const file = resolve(exportDir, "CustomerFile.csv");
  console.log("Loading CustomerFile…");
  let ops = [];
  for await (const row of streamCsv(file)) {
    const c = coerceCustomer(row);
    if (!c) continue;
    counts.customers++;
    const cnum = c.cnum;
    ops.push((p) => {
      p.set(`pp:por:cust:${cnum}`, c);
      for (const t of nameTokens(c.name)) p.sadd(`pp:por:cust-name:${t}`, cnum);
    });
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
      if (counts.customers % 2000 === 0) console.log(`  customers ${counts.customers}`);
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Customers: ${counts.customers}`);
}

// ——— Job sites ———
{
  const file = resolve(exportDir, "CustomerJobSite.csv");
  console.log("Loading CustomerJobSite…");
  const by = new Map();
  for await (const row of streamCsv(file)) {
    const s = coerceJobSite(row);
    if (!s) continue;
    counts.jobSites++;
    const list = by.get(s.cnum) || [];
    list.push(s);
    by.set(s.cnum, list);
  }
  let ops = [];
  for (const [cnum, sites] of by) {
    ops.push((p) => p.set(`pp:por:cust:${cnum}:sites`, sites));
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Job sites: ${counts.jobSites}`);
}

// ——— Comments ———
{
  const file = resolve(exportDir, "CustomerComments.csv");
  console.log("Loading CustomerComments…");
  const by = new Map();
  for await (const row of streamCsv(file)) {
    const c = coerceComment(row);
    if (!c) continue;
    counts.comments++;
    const list = by.get(c.cnum) || [];
    list.push(c);
    by.set(c.cnum, list);
  }
  let ops = [];
  for (const [cnum, comments] of by) {
    ops.push((p) => p.set(`pp:por:cust:${cnum}:comments`, comments));
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Comments: ${counts.comments}`);
}

// ——— Items (also build catalog) ———
const catalogItems = [];
{
  const file = resolve(exportDir, "ItemFile.csv");
  console.log("Loading ItemFile…");
  let ops = [];
  for await (const row of streamCsv(file)) {
    const item = coerceItem(row);
    if (!item) continue;
    counts.items++;
    catalogItems.push({
      sku: item.key,
      name: item.name,
      categoryCode: item.category || "",
      category: "",
      num: item.num,
      ratePerDay: item.rate1 ?? 0,
      qty: item.qty ?? 0,
      available: Math.max(0, (item.qty ?? 0) - (item.qyot ?? 0)),
    });
    ops.push((p) => {
      p.set(`pp:por:item:${item.num}`, item);
      p.set(`pp:por:item-sku:${item.key}`, item.num);
    });
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Items: ${counts.items}`);
}

// ——— Transactions (keep map for reservation rebuild) ———
const txByCntr = new Map();
{
  const file = resolve(exportDir, "Transactions.csv");
  console.log("Loading Transactions…");
  let ops = [];
  for await (const row of streamCsv(file)) {
    const tx = coerceTx(row);
    if (!tx) continue;
    counts.transactions++;
    txByCntr.set(tx.cntr, tx);
    ops.push((p) => {
      p.set(`pp:por:tx:${tx.cntr}`, tx);
      p.sadd(`pp:por:cust:${tx.cusn}:tx`, tx.cntr);
    });
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
      if (counts.transactions % 20000 === 0) {
        console.log(`  transactions ${counts.transactions}`);
      }
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Transactions: ${counts.transactions}`);
}

// ——— TransactionItems ———
const reservations = [];
const now = Date.now();
const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
{
  const file = resolve(exportDir, "TransactionItems.csv");
  console.log("Loading TransactionItems…");
  const by = new Map();
  for await (const row of streamCsv(file)) {
    const line = coerceTxItem(row);
    if (!line) continue;
    counts.transactionItems++;
    const list = by.get(line.cntr) || [];
    list.push(line);
    by.set(line.cntr, list);

    const tx = txByCntr.get(line.cntr);
    if (tx) {
      const stat = (tx.stat || "").trim().toUpperCase();
      const del = parsePorDate(tx.deliveryDate) || parsePorDate(tx.date);
      const pick =
        parsePorDate(tx.pickupDate) ||
        parsePorDate(tx.eventEndDate) ||
        del;
      if (del) {
        const inWindow =
          del.getTime() >= now - WINDOW_MS ||
          (pick && pick.getTime() >= now - WINDOW_MS) ||
          del.getTime() >= now ||
          (pick && pick.getTime() >= now);
        const openStat = !stat || "ROQ".includes(stat);
        if (inWindow && openStat && line.item && line.qty) {
          reservations.push({
            itemKey: line.item,
            qty: line.qty,
            delivery: toISODate(del),
            pickup: toISODate(pick || del),
            status: stat || "?",
            firm: stat === "R" || stat === "O",
          });
        }
      }
    }

    if (counts.transactionItems % 50000 === 0) {
      console.log(`  tx items ${counts.transactionItems}`);
    }
  }

  let ops = [];
  let written = 0;
  for (const [cntr, items] of by) {
    ops.push((p) => p.set(`pp:por:tx-items:${cntr}`, items));
    written++;
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`TransactionItems: ${counts.transactionItems} (${written} contracts)`);
  // Free memory before payments
  by.clear();
}

txByCntr.clear();

// ——— Payments (no card fields) ———
{
  const file = resolve(exportDir, "PaymentFile.csv");
  console.log("Loading PaymentFile (card fields stripped)…");
  let ops = [];
  for await (const row of streamCsv(file)) {
    const pay = coercePayment(row);
    if (!pay) continue;
    counts.payments++;
    ops.push((p) => p.set(`pp:por:pay:${pay.payment}`, pay));
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`Payments: ${counts.payments}`);
}

// ——— PaymentDetail ———
{
  const file = resolve(exportDir, "PaymentDetail.csv");
  console.log("Loading PaymentDetail…");
  const by = new Map();
  for await (const row of streamCsv(file)) {
    const d = coercePayDetail(row);
    if (!d) continue;
    counts.paymentDetails++;
    const list = by.get(d.payment) || [];
    list.push(d);
    by.set(d.payment, list);
  }
  let ops = [];
  for (const [payment, details] of by) {
    ops.push((p) => {
      p.set(`pp:por:pay:${payment}:detail`, details);
      for (const d of details) {
        p.sadd(`pp:por:tx:${d.contract}:pays`, payment);
      }
    });
    if (ops.length >= BATCH) {
      await flushPipeline(ops);
      ops = [];
    }
  }
  if (ops.length) await flushPipeline(ops);
  console.log(`PaymentDetails: ${counts.paymentDetails}`);
}

const syncedAt = new Date().toISOString();
const meta = {
  syncedAt,
  source: `CSV bootstrap ${exportDir}`,
  counts,
};
await redis.set("pp:por:crm-meta", meta);

const catalogState = {
  items: catalogItems,
  activeItems: catalogItems.length,
  source: `CSV bootstrap ItemFile ${exportDir}`,
  syncedAt,
};
await redis.set(`${REDIS_JSON_PREFIX}por-catalog.json`, catalogState);
await redis.sadd(REDIS_ALL_KEYS, "por-catalog.json");

const reservationState = {
  reservations,
  syncedAt,
  source: `CSV bootstrap Transactions+TransactionItems ${exportDir}`,
};
await redis.set(`${REDIS_JSON_PREFIX}por-reservations.json`, reservationState);
await redis.sadd(REDIS_ALL_KEYS, "por-reservations.json");

console.log("Done.");
console.log(JSON.stringify({ meta, catalog: catalogItems.length, reservations: reservations.length }, null, 2));
