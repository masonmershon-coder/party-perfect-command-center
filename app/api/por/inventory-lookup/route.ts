import { lookupInventory } from "@/lib/inventory-lookup";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/por/inventory-lookup?q=<item name>[&date=YYYY-MM-DD]
 * "how many 8 Flip tables are out right now?" → q=8 Flip table (date defaults to today)
 * Returns top matches with total / out-now / available.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const date = url.searchParams.get("date")?.trim() || undefined;

  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Provide ?q= (item name), at least 2 characters" }, { status: 400 });
  }

  try {
    const results = await lookupInventory(q, date);
    return NextResponse.json({ query: q, date: results[0]?.date, results });
  } catch (err) {
    console.error("[inventory-lookup]", err);
    return NextResponse.json({ error: "Inventory lookup failed. Try again." }, { status: 502 });
  }
}
