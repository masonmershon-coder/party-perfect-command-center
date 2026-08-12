import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { checkQuoteAvailability } from "@/lib/por-availability";

/** POST { lines:[{itemKey|sku, qty}], date } -> { date, results[], anyOverbooked } */
export async function POST(req: Request) {
  const gate = await requireApiAuth("quoting");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await req.json()) as {
      lines?: Array<{ itemKey?: string; sku?: string; qty: number }>;
      date?: string;
    };
    const lines = (Array.isArray(body?.lines) ? body.lines : []).map((l) => ({
      itemKey: String(l.itemKey ?? l.sku ?? ""),
      qty: Number(l.qty) || 0,
    }));
    const results = await checkQuoteAvailability(lines, String(body?.date || ""));
    return privateJson({
      date: body?.date,
      results,
      anyOverbooked: results.some((r) => r.overbooked),
    });
  } catch (err) {
    return privateJson({ error: (err as Error).message }, { status: 400 });
  }
}
