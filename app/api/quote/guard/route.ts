import { NextResponse } from "next/server";
import { guardQuote } from "@/lib/quote-guard";

/**
 * POST { lines:[{itemKey|sku, qty}], date }
 *  -> { ok, date, conflicts[], warnings[], summary }
 *
 * Decision-shaped overbooking check for the save/approve path. `ok:false` means a
 * hard overbook — the quote would promise stock that isn't there on that date.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      lines?: Array<{ itemKey?: string; sku?: string; qty: number }>;
      date?: string;
    };
    const result = await guardQuote(
      Array.isArray(body?.lines) ? body.lines : [],
      String(body?.date || ""),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
