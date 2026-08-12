/**
 * Read-only query helpers over the Supabase `por` mirror.
 *
 * Powers the Quote Desk: customer search + full history (contracts, events,
 * payments). POR stays system of record; this only reads the mirror.
 *
 * FINANCIALS ARE GATED: dollar fields (balances, totals, payment amounts) are
 * only returned when `includeFinancials` is true — callers pass that ONLY for
 * the owner role. Employees get operational data with money stripped.
 *
 * Env: DATABASE_URL (Supabase Postgres connection string).
 * Requires: pg. Degrades gracefully (throws a clear error) until DATABASE_URL is set.
 */
import pg from "pg";
import { isValidTransactionPoolerUri } from "./supabase-probe";

let pool: pg.Pool | null = null;
function db(): pg.Pool {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("por-db not configured: set DATABASE_URL (Supabase)");
  }
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export function isPorDbConfigured(): boolean {
  return isValidTransactionPoolerUri(process.env.DATABASE_URL);
}

export type CustomerHit = {
  key: string;
  name: string | null;
  company: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  lastActive: string | null;
};

/** Fuzzy search by name / company / phone / email. */
export async function searchCustomers(term: string, limit = 20): Promise<CustomerHit[]> {
  const q = `%${term.trim()}%`;
  const { rows } = await db().query(
    `select key, name, company, city,
            coalesce(mobile, phone, work_phone) as phone, email, last_active
       from por.customers
      where name ilike $1 or company ilike $1 or email ilike $1
         or phone ilike $1 or mobile ilike $1 or work_phone ilike $1
      order by last_active desc nulls last
      limit $2`,
    [q, Math.min(limit, 100)]
  );
  return rows.map((r) => ({
    key: r.key, name: r.name, company: r.company, city: r.city,
    phone: r.phone, email: r.email, lastActive: r.last_active,
  }));
}

export type ContractSummary = {
  cntr: string;
  date: string | null;
  status: string | null;
  statusDesc: string | null;
  eventEndDate: string | null;
  deliveryCity: string | null;
  total?: number | null;
  paid?: number | null;
};

export type CustomerHistory = {
  customer: {
    key: string;
    name: string | null;
    company: string | null;
    address: string | null;
    city: string | null;
    zip: string | null;
    phone: string | null;
    email: string | null;
    numberContracts: number | null;
    currentBalance?: number | null; // owner-only
  };
  contracts: ContractSummary[];
  payments?: { date: string | null; amount: number | null; method: string | null; cntr: string | null }[]; // owner-only
  stats: { booked: number; quotes: number; cancelled: number; bookedValue?: number };
};

/** Full customer profile + history. Money only included when includeFinancials. */
export async function getCustomerHistory(
  key: string,
  includeFinancials = false
): Promise<CustomerHistory | null> {
  const client = db();
  const cust = await client.query(
    `select key, name, company, address, city, zip,
            coalesce(mobile, phone, work_phone) as phone, email,
            number_contracts, current_balance
       from por.customers where key = $1`,
    [key]
  );
  if (!cust.rows.length) return null;
  const c = cust.rows[0];

  const contracts = await client.query(
    `select cntr, txn_date, status, status_desc, event_end_date, delivery_city, total, paid
       from por.contracts where customer_key = $1
      order by txn_date desc nulls last limit 100`,
    [key]
  );

  const stats = await client.query(
    `select
       count(*) filter (where status in ('R','O','D')) as booked,
       count(*) filter (where status = 'Q') as quotes,
       count(*) filter (where status = 'C') as cancelled,
       coalesce(sum(total) filter (where status in ('R','O','D')),0) as booked_value
     from por.contracts where customer_key = $1`,
    [key]
  );
  const s = stats.rows[0];

  const history: CustomerHistory = {
    customer: {
      key: c.key, name: c.name, company: c.company, address: c.address, city: c.city, zip: c.zip,
      phone: c.phone, email: c.email, numberContracts: c.number_contracts,
      ...(includeFinancials ? { currentBalance: c.current_balance != null ? Number(c.current_balance) : null } : {}),
    },
    contracts: contracts.rows.map((r) => ({
      cntr: r.cntr, date: r.txn_date, status: r.status, statusDesc: r.status_desc,
      eventEndDate: r.event_end_date, deliveryCity: r.delivery_city,
      ...(includeFinancials ? { total: r.total != null ? Number(r.total) : null, paid: r.paid != null ? Number(r.paid) : null } : {}),
    })),
    stats: {
      booked: Number(s.booked), quotes: Number(s.quotes), cancelled: Number(s.cancelled),
      ...(includeFinancials ? { bookedValue: Number(s.booked_value) } : {}),
    },
  };

  if (includeFinancials) {
    const pays = await client.query(
      `select pay_date, amount, method, cntr from por.payments
        where customer_key = $1 order by pay_date desc nulls last limit 100`,
      [key]
    );
    history.payments = pays.rows.map((r) => ({
      date: r.pay_date, amount: r.amount != null ? Number(r.amount) : null, method: r.method, cntr: r.cntr,
    }));
  }

  return history;
}
