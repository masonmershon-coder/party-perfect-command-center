import {
  isAuthError,
  requireApiAuth,
} from "@/lib/api-auth";
import { isPorSyncConfigured } from "@/lib/por-snapshot";
import { isPorDbConfigured } from "@/lib/por-db";
import {
  recordPorSyncError,
  recordPorSyncSuccess,
} from "@/lib/por-sync-health";
import pg from "pg";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ENTERPRISE sync → Supabase por.* upserts.
 * Authorization: Bearer POR_SYNC_SECRET
 * Never accepts card ciphertext fields (strip on write).
 */

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

function normalizeId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^0+(?=\d)/, "");
}

function asNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function asInt(value: unknown): number | null {
  const n = asNum(value);
  return n == null ? null : Math.trunc(n);
}

function asBool(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

type CrmBody = {
  source?: string;
  customers?: Record<string, unknown>[];
  contracts?: Record<string, unknown>[];
  contractItems?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  salesmen?: Record<string, unknown>[];
  counts?: Record<string, number>;
};

let pool: pg.Pool | null = null;
function db(): pg.Pool {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL not set");
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json(
      { error: "POR_SYNC_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPorDbConfigured()) {
    await recordPorSyncError(
      "postgres",
      "DATABASE_URL not configured for Postgres mirror.",
    );
    return NextResponse.json(
      { error: "DATABASE_URL not configured for Postgres mirror." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as CrmBody;
    const client = await db().connect();
    const written = {
      customers: 0,
      contracts: 0,
      contractItems: 0,
      payments: 0,
      items: 0,
      salesmen: 0,
    };

    try {
      await client.query("BEGIN");

      if (Array.isArray(body.salesmen)) {
        for (const row of body.salesmen) {
          const number = asInt(row.number ?? row.Number);
          if (number == null) continue;
          await client.query(
            `insert into por.salesmen (number, name, inactive, email, imported_at)
             values ($1,$2,$3,$4,now())
             on conflict (number) do update set
               name=excluded.name, inactive=excluded.inactive, email=excluded.email, imported_at=now()`,
            [number, str(row.name ?? row.Name), asBool(row.inactive ?? row.Inactive), str(row.email ?? row.Email)],
          );
          written.salesmen++;
        }
      }

      if (Array.isArray(body.customers)) {
        for (const row of body.customers) {
          const key = normalizeId(row.cnum ?? row.CNUM ?? row.key ?? row.KEY);
          if (!key) continue;
          const alt = str(row.alt_key ?? row.KEY);
          await client.query(
            `insert into por.customers (
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
               status=excluded.status, salesman=excluded.salesman,
               open_date=excluded.open_date, last_active=excluded.last_active,
               last_contract=excluded.last_contract, number_contracts=excluded.number_contracts,
               current_balance=excluded.current_balance, no_email=excluded.no_email,
               imported_at=now()`,
            [
              key,
              alt && normalizeId(alt) !== key ? alt : null,
              str(row.name ?? row.NAME),
              str(row.company ?? row.NameAlias),
              str(row.address ?? row.Address),
              str(row.address2 ?? row.Address2),
              str(row.city ?? row.CITY),
              str(row.zip ?? row.ZIP),
              str(row.phone ?? row.Phone),
              str(row.work ?? row.WORK ?? row.work_phone),
              str(row.mobile ?? row.MOBILE),
              str(row.email ?? row.Email),
              str(row.type ?? row.Type),
              str(row.status ?? row.Status),
              asInt(row.salesman ?? row.Salesman),
              str(row.openDate ?? row.OpenDate),
              str(row.lastActive ?? row.LastActive),
              str(row.lastContract ?? row.LastContract),
              asInt(row.numberContracts ?? row.NumberContracts),
              asNum(row.currentBalance ?? row.CurrentBalance),
              asBool(row.noEmail ?? row.NoEmail),
            ],
          );
          written.customers++;
        }
      }

      if (Array.isArray(body.items)) {
        for (const row of body.items) {
          const num = normalizeId(row.num ?? row.NUM);
          const key = str(row.key ?? row.KEY);
          if (!num || !key) continue;
          await client.query(
            `insert into por.items (num, key, name, category, qty, qty_out, rate1, sell, inactive, imported_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
             on conflict (num) do update set
               key=excluded.key, name=excluded.name, category=excluded.category,
               qty=excluded.qty, qty_out=excluded.qty_out, rate1=excluded.rate1,
               sell=excluded.sell, inactive=excluded.inactive, imported_at=now()`,
            [
              num,
              key,
              str(row.name ?? row.Name),
              str(row.category ?? row.Category),
              asNum(row.qty ?? row.QTY),
              asNum(row.qty_out ?? row.QYOT ?? row.qyot),
              asNum(row.rate1 ?? row.RATE1),
              asNum(row.sell ?? row.SELL),
              asBool(row.inactive ?? row.Inactive),
            ],
          );
          written.items++;
        }
      }

      if (Array.isArray(body.contracts)) {
        for (const row of body.contracts) {
          const cntr = normalizeId(row.cntr ?? row.CNTR);
          const customer_key = normalizeId(row.cusn ?? row.CUSN ?? row.customer_key);
          if (!cntr || !customer_key) continue;
          const status = str(row.status ?? row.Status ?? row.stat ?? row.STAT);
          await client.query(
            `insert into por.contracts (
               cntr, txn_date, status, customer_key, salesman,
               rent, sale, damage_waiver, other, tax, total, paid,
               delivery_date, pickup_date, event_end_date,
               delivery_address, delivery_city, delivery_zip,
               contact, contact_phone, cancelled, archived, notes, imported_at
             ) values (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,$21,$22,$23,now()
             )
             on conflict (cntr) do update set
               txn_date=excluded.txn_date, status=excluded.status,
               customer_key=excluded.customer_key, salesman=excluded.salesman,
               rent=excluded.rent, sale=excluded.sale, damage_waiver=excluded.damage_waiver,
               other=excluded.other, tax=excluded.tax, total=excluded.total, paid=excluded.paid,
               delivery_date=excluded.delivery_date, pickup_date=excluded.pickup_date,
               event_end_date=excluded.event_end_date, delivery_address=excluded.delivery_address,
               delivery_city=excluded.delivery_city, delivery_zip=excluded.delivery_zip,
               contact=excluded.contact, contact_phone=excluded.contact_phone,
               cancelled=excluded.cancelled, archived=excluded.archived, notes=excluded.notes,
               imported_at=now()`,
            [
              cntr,
              str(row.date ?? row.DATE ?? row.txn_date),
              status,
              customer_key,
              asInt(row.salesman ?? row.Salesman),
              asNum(row.rent ?? row.RENT),
              asNum(row.sale ?? row.SALE),
              asNum(row.damage_waiver ?? row.DMG),
              asNum(row.other ?? row.OTHR),
              asNum(row.tax ?? row.TAX),
              asNum(row.total ?? row.TOTL),
              asNum(row.paid ?? row.PAID),
              str(row.deliveryDate ?? row.DeliveryDate),
              str(row.pickupDate ?? row.PickupDate),
              str(row.eventEndDate ?? row.EventEndDate),
              str(row.deliveryAddress ?? row.DeliveryAddress),
              str(row.deliveryCity ?? row.DeliveryCity),
              str(row.deliveryZip ?? row.DeliveryZip),
              str(row.contact ?? row.Contact),
              str(row.contactPhone ?? row.ContactPhone),
              asBool(row.cancelled ?? row.Cancelled),
              asBool(row.archived ?? row.Archived),
              str(row.notes ?? row.DeliveryNotes),
            ],
          );
          written.contracts++;
        }
      }

      if (Array.isArray(body.contractItems)) {
        for (const row of body.contractItems) {
          const cntr = normalizeId(row.cntr ?? row.CNTR);
          const item = normalizeId(row.item ?? row.ITEM);
          const id =
            str(row.id ?? row.Id) ||
            (cntr ? `${cntr}:${row.lineNumber ?? row.LineNumber ?? written.contractItems}` : null);
          if (!id || !cntr) continue;
          await client.query(
            `insert into por.contract_items (
               id, cntr, item, qty, price, description, daily_amount, weekly_amount,
               monthly_amount, discount_amount, tax_amount, out_date, line_number
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             on conflict (id) do update set
               cntr=excluded.cntr, item=excluded.item, qty=excluded.qty, price=excluded.price,
               description=excluded.description, daily_amount=excluded.daily_amount,
               weekly_amount=excluded.weekly_amount, monthly_amount=excluded.monthly_amount,
               discount_amount=excluded.discount_amount, tax_amount=excluded.tax_amount,
               out_date=excluded.out_date, line_number=excluded.line_number`,
            [
              id,
              cntr,
              item,
              asNum(row.qty ?? row.QTY),
              asNum(row.price ?? row.PRIC),
              str(row.description ?? row.Desc),
              asNum(row.daily_amount ?? row.DailyAmount),
              asNum(row.weekly_amount ?? row.WeeklyAmount),
              asNum(row.monthly_amount ?? row.MonthlyAmount),
              asNum(row.discount_amount ?? row.DiscountAmount),
              asNum(row.tax_amount ?? row.TaxAmount),
              str(row.out_date ?? row.OutDate),
              asInt(row.line_number ?? row.LineNumber),
            ],
          );
          written.contractItems++;
        }
      }

      if (Array.isArray(body.payments)) {
        for (const row of body.payments) {
          // Never persist Encrypted / EncryptedCard / CCAlias even if sent
          const payment = normalizeId(row.payment ?? row.Payment);
          if (!payment) continue;
          await client.query(
            `insert into por.payments (
               payment, pay_date, customer_key, cntr, amount, method, type, ref_no, notes
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (payment) do update set
               pay_date=excluded.pay_date, customer_key=excluded.customer_key, cntr=excluded.cntr,
               amount=excluded.amount, method=excluded.method, type=excluded.type,
               ref_no=excluded.ref_no, notes=excluded.notes`,
            [
              payment,
              str(row.date ?? row.Date ?? row.pay_date),
              normalizeId(row.custNumb ?? row.CustNumb ?? row.customer_key) || null,
              normalizeId(row.cntr ?? row.TransID ?? row.Contract) || null,
              asNum(row.amount ?? row.Amount),
              str(row.meth ?? row.Meth ?? row.method),
              str(row.type ?? row.Type),
              str(row.refNo ?? row.RefNo),
              str(row.notes ?? row.Notes),
            ],
          );
          written.payments++;
        }
      }

      await client.query(
        `create table if not exists por.sync_meta (
           id text primary key default 'default',
           synced_at timestamptz not null default now(),
           source text,
           counts jsonb
         );
         insert into por.sync_meta (id, synced_at, source, counts)
         values ('default', now(), $1, $2::jsonb)
         on conflict (id) do update set
           synced_at=now(), source=excluded.source, counts=excluded.counts`,
        [
          body.source || "ENTERPRISE Sync-PorSnapshot Postgres",
          JSON.stringify(body.counts || written),
        ],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    await recordPorSyncSuccess("postgres");
    return NextResponse.json({ ok: true, written });
  } catch (error) {
    console.error("[por/sync/postgres]", error);
    await recordPorSyncError("postgres", "Failed to sync POR mirror.");
    return NextResponse.json(
      { error: "Failed to sync POR mirror. Try again." },
      { status: 500 },
    );
  }
}

export async function GET() {
  const gate = await requireApiAuth("por");
  if (isAuthError(gate)) return gate;

  return NextResponse.json({
    configured: isPorSyncConfigured() && isPorDbConfigured(),
  });
}
