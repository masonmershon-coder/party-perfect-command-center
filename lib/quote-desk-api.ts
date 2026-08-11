/**
 * Client-side helpers for the Showroom Quote Desk pieces Claude owns:
 * customer lookup/history (Postgres mirror) + Square deposit links.
 * Kept separate from lib/client-api.ts so it composes into Cursor's
 * quoting-section without collisions. Financials come back only for owners
 * (the API gates by session role).
 */

export type CustomerHit = {
  key: string;
  name: string | null;
  company: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  lastActive: string | null;
};

export type ContractSummary = {
  cntr: string;
  date: string | null;
  status: string | null;
  statusDesc: string | null;
  eventEndDate: string | null;
  deliveryCity: string | null;
  total?: number | null; // owner-only
  paid?: number | null; // owner-only
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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && (data.error as string)) || fallback;
  } catch {
    return fallback;
  }
}

/** Fuzzy search customers by name / company / phone / email. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  const res = await fetch(`/api/por/customer-history?q=${encodeURIComponent(q.trim())}`);
  if (!res.ok) throw new Error(await readError(res, "Customer search failed"));
  const data = await res.json();
  return (data.results ?? []) as CustomerHit[];
}

/** Full customer profile + history. Money fields present only for owner sessions. */
export async function getCustomerHistory(key: string): Promise<CustomerHistory> {
  const res = await fetch(`/api/por/customer-history?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(await readError(res, "Could not load customer history"));
  return (await res.json()) as CustomerHistory;
}

export type DepositLinkResult = { url: string; paymentLinkId: string; orderId?: string };

/** Create a Square-hosted deposit/authorization link (no card data touches us). */
export async function createDepositLink(input: {
  amountUsd: number;
  name: string;
  referenceId?: string;
  buyerEmail?: string;
  note?: string;
}): Promise<DepositLinkResult> {
  const res = await fetch("/api/payments/square-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not create deposit link"));
  return (await res.json()) as DepositLinkResult;
}
