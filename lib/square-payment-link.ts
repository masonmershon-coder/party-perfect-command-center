/**
 * Square Payment Links — deposit / authorization links for the Quote Desk.
 *
 * The girls generate a link; the customer pays on Square's HOSTED page.
 * No card number (PAN) ever touches Command Center — we only get back a URL
 * and, later, Square's payment status. This keeps us out of PCI scope.
 *
 * Env (set in Vercel; never in the client bundle):
 *   SQUARE_ACCESS_TOKEN — Square API access token
 *   SQUARE_LOCATION_ID  — the Square location to attribute payments to
 *   SQUARE_ENV          — "production" (default) or "sandbox"
 */

const SQUARE_VERSION = "2024-07-17";

function squareBase(): string {
  return (process.env.SQUARE_ENV || "production").trim() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function assertSquareConfigured(): void {
  if (!process.env.SQUARE_ACCESS_TOKEN?.trim() || !process.env.SQUARE_LOCATION_ID?.trim()) {
    throw new Error("Square not configured: set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID");
  }
}

export type DepositLinkInput = {
  /** Dollar amount, e.g. 250.00 (must be > 0). */
  amountUsd: number;
  /** What the customer sees, e.g. "Party Perfect deposit — Smith Wedding". */
  name: string;
  /** Our reference to reconcile later (e.g. the POR contract CNTR or a CC quote id). */
  referenceId?: string;
  /** Optional: pre-fill the customer's email on Square's page. */
  buyerEmail?: string;
  /** Optional note stored on the Square order. */
  note?: string;
};

export type DepositLink = {
  url: string;
  paymentLinkId: string;
  orderId?: string;
};

/**
 * Create a Square-hosted payment link for a deposit or authorization.
 * Returns the URL to send/text the customer. Throws on config or API error.
 */
export async function createDepositLink(input: DepositLinkInput): Promise<DepositLink> {
  assertSquareConfigured();

  const cents = Math.round(Number(input.amountUsd) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("Deposit amount must be greater than 0");
  }

  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: input.name.slice(0, 255),
      price_money: { amount: cents, currency: "USD" },
      location_id: process.env.SQUARE_LOCATION_ID!.trim(),
    },
    ...(input.referenceId || input.note
      ? { order: { reference_id: input.referenceId?.slice(0, 40), note: input.note?.slice(0, 500) } }
      : {}),
    ...(input.buyerEmail ? { pre_populated_data: { buyer_email: input.buyerEmail } } : {}),
  };

  const res = await fetch(`${squareBase()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN!.trim()}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || `Square API error (${res.status})`;
    throw new Error(msg);
  }

  const link = data?.payment_link;
  if (!link?.url) throw new Error("Square did not return a payment link URL");
  return { url: link.url, paymentLinkId: link.id, orderId: link.order_id };
}
