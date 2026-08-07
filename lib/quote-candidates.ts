import { searchPorCatalog } from "@/lib/por-catalog";
import { parseQuantityMentions } from "@/lib/quote-from-text";
import type { PorCatalogItem } from "@/lib/types";

/**
 * For each item a girl mentions ("12 round tables"), return the TOP N catalog
 * candidates so the Quoting-tab UI can show options and let her pick the right
 * SKU — instead of the engine guessing a single (sometimes wrong) match.
 */
export interface QuoteCandidateLine {
  qty: number;
  term: string;
  candidates: Array<PorCatalogItem & { score: number }>;
}

export async function candidatesFromText(
  text: string,
  perItem = 3,
): Promise<QuoteCandidateLine[]> {
  const mentions = parseQuantityMentions(text);
  const perItemClamped = Math.min(Math.max(perItem, 1), 8);
  const out: QuoteCandidateLine[] = [];
  for (const { qty, term } of mentions) {
    const candidates = await searchPorCatalog(term, perItemClamped);
    out.push({ qty, term, candidates });
  }
  return out;
}
