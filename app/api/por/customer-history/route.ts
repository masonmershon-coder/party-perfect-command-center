import { getCustomerHistory, isPorDbConfigured, searchCustomers } from "@/lib/por-db";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/por/customer-history?q=<search>        → customer matches
 * GET /api/por/customer-history?key=<customerKey> → full history
 *
 * Reads the Supabase `por` mirror. Financial fields (balances, totals,
 * payments) are ONLY included for the owner role.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;
  const isOwner = session.role === "owner";

  if (!isPorDbConfigured()) {
    return NextResponse.json({ error: "Customer database not connected yet (set DATABASE_URL)" }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const key = url.searchParams.get("key")?.trim();

  try {
    if (key) {
      const history = await getCustomerHistory(key, isOwner);
      if (!history) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      return NextResponse.json(history);
    }
    if (q) {
      if (q.length < 2) return NextResponse.json({ error: "Search term too short" }, { status: 400 });
      return NextResponse.json({ results: await searchCustomers(q) });
    }
    return NextResponse.json({ error: "Provide ?q= (search) or ?key= (history)" }, { status: 400 });
  } catch (err) {
    console.error("[customer-history]", err);
    return NextResponse.json(
      { error: "Customer lookup failed. Try again." },
      { status: 502 },
    );
  }
}
