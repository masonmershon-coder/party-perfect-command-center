import { searchPorCatalog } from "@/lib/por-catalog";
import { buildQuote, type QuoteMeta } from "@/lib/quote-engine";
import type { Quote, QuoteLineInput } from "@/lib/types";

/**
 * Voice/text → quote. A girl types or dictates what's on the table
 * ("120 gold chargers, 130 forks, 12 round tables") and we parse the
 * quantities, match each to the real POR catalog, and price it.
 */

const WORD_NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
};

/** Pull { qty, term } pairs out of free text. */
export function parseQuantityMentions(
  text: string,
): Array<{ qty: number; term: string }> {
  const chunks = (text || "").split(/[,;\n]|\band\b/i);
  const out: Array<{ qty: number; term: string }> = [];
  for (const chunk of chunks) {
    // Find a quantity anywhere in the chunk; the item phrase runs to the end.
    const m = chunk
      .trim()
      .match(
        /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|dozen)\s*x?\s+([a-zA-Z][a-zA-Z0-9\s\-/'"]*)$/i,
      );
    if (!m) continue;
    const num = m[1].toLowerCase();
    const qty = /^\d+$/.test(num) ? parseInt(num, 10) : WORD_NUMS[num] ?? 0;
    const term = m[2].trim().replace(/[.!?]+$/, "");
    if (qty > 0 && term.length >= 2) out.push({ qty, term });
  }
  return out;
}

/** Match each mention to the catalog → priced quote lines (unmatched left at $0 for the girl to fill). */
export async function quoteLinesFromText(
  text: string,
): Promise<QuoteLineInput[]> {
  const mentions = parseQuantityMentions(text);
  const lines: QuoteLineInput[] = [];
  for (const { qty, term } of mentions) {
    const [hit] = await searchPorCatalog(term, 1);
    if (hit) {
      lines.push({
        qty,
        description: hit.name,
        unitRate: hit.ratePerDay,
        porItemName: hit.name,
        porItemId: hit.sku,
        category: hit.category,
        kind: "product",
      });
    } else {
      lines.push({ qty, description: term, unitRate: 0, kind: "product" });
    }
  }
  return lines;
}

/** One call: free text (+ optional service lines) → full quote. */
export async function buildQuoteFromText(input: {
  command: string;
  serviceLines?: QuoteLineInput[];
  meta?: QuoteMeta;
}): Promise<Quote> {
  return buildQuote({
    productLines: await quoteLinesFromText(input.command),
    serviceLines: input.serviceLines,
  });
}
