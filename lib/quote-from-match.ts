import { buildQuote, type QuoteMeta } from "@/lib/quote-engine";
import type { DesignMatchedItem, Quote, QuoteLineInput } from "@/lib/types";

/**
 * Turn Madison's matched catalog items (from a photo/voice) into priced quote
 * lines. Quantities come from `quantities[key]` (what the girl said / counted),
 * default 1. Rates come from the matched POR catalog data.
 */
export function quoteLinesFromMatches(
  matches: DesignMatchedItem[],
  quantities: Record<string, number> = {},
): QuoteLineInput[] {
  return matches.map((m) => ({
    qty: Math.max(1, Math.round(quantities[m.key] ?? 1)),
    description: m.name,
    unitRate: m.porPricePerDay ?? 0,
    porItemName: m.name,
    porItemId: m.porItemId,
    category: m.categoryName,
    kind: "product" as const,
  }));
}

/** One call: matched items (+ quantities + optional service lines) -> full quote. */
export function buildQuoteFromMatches(input: {
  matches: DesignMatchedItem[];
  quantities?: Record<string, number>;
  serviceLines?: QuoteLineInput[];
  meta?: QuoteMeta;
}): Quote {
  return buildQuote({
    productLines: quoteLinesFromMatches(input.matches, input.quantities || {}),
    serviceLines: input.serviceLines,
  });
}
