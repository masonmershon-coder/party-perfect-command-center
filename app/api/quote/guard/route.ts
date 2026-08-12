import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { guardQuote } from "@/lib/quote-guard";

/**
 * POST { lines:[{itemKey|sku, qty}], date }
 *  -> { ok, date, conflicts[], warnings[], summary }
 *
 * Decision-shaped overbooking check for the save/approve path. `ok:false` means a
 * hard overbook — the quote would promise stock that isn't there on that date.
 */
export async function POST(req: Request) {
  const gate = await requireApiAuth("quoting");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await req.json()) as {
      lines?: Array<{ itemKey?: string; sku?: string; qty: number }>;
      date?: string;
    };
    const result = await guardQuote(
      Array.isArray(body?.lines) ? body.lines : [],
      String(body?.date || ""),
    );
    return privateJson(result);
  } catch (err) {
    return privateJson({ error: (err as Error).message }, { status: 400 });
  }
}
