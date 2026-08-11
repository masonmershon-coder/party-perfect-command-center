import { createDepositLink } from "@/lib/square-payment-link";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/payments/square-link
 * Body: { amountUsd: number, name: string, referenceId?, buyerEmail?, note? }
 * Returns: { url, paymentLinkId, orderId? }
 *
 * Any signed-in staff member may create a deposit link (the showroom needs it).
 * No card data is handled here — Square hosts the payment page.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amountUsd, name, referenceId, buyerEmail, note } = (payload ?? {}) as Record<string, unknown>;

  if (typeof amountUsd !== "number" || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: "amountUsd must be a number greater than 0" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const link = await createDepositLink({
      amountUsd,
      name: name.trim(),
      referenceId: typeof referenceId === "string" ? referenceId : undefined,
      buyerEmail: typeof buyerEmail === "string" ? buyerEmail : undefined,
      note: typeof note === "string" ? note : undefined,
    });
    return NextResponse.json(link);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    // Config errors → 503 so the UI can say "Square isn't set up yet"; others → 502.
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
