import { getPorCatalog, searchPorCatalog } from "@/lib/por-catalog";
import { rankPickerOptions, toPickerOptions } from "@/lib/por-kits";
import { parseQuantityMentions } from "@/lib/quote-from-text";
import type { PorCatalogItem } from "@/lib/types";

/**
 * For each item a girl mentions ("12 round tables"), return the TOP N catalog
 * candidates so the Quoting-tab UI can show options and let her pick the right
 * SKU — instead of the engine guessing a single (sometimes wrong) match.
 * Kit headers are expanded; the operator must still choose a component.
 */
export interface QuoteCandidateLine {
  qty: number;
  term: string;
  candidates: Array<
    PorCatalogItem & {
      score: number;
      viaKitName?: string;
      viaKitSku?: string;
      suggestedQuantity?: number;
    }
  >;
}

export async function candidatesFromText(
  text: string,
  perItem = 3,
): Promise<QuoteCandidateLine[]> {
  const mentions = parseQuantityMentions(text);
  const perItemClamped = Math.min(Math.max(perItem, 1), 8);
  const catalog = await getPorCatalog();
  const out: QuoteCandidateLine[] = [];
  for (const { qty, term } of mentions) {
    const raw = await searchPorCatalog(term, perItemClamped * 3);
    const expanded = rankPickerOptions(toPickerOptions(raw, catalog)).slice(
      0,
      perItemClamped,
    );
    out.push({
      qty,
      term,
      candidates: expanded.map((opt, i) => ({
        ...opt.item,
        score: raw[i]?.score ?? 80,
        viaKitName: opt.viaKitName,
        viaKitSku: opt.viaKitSku,
        suggestedQuantity: opt.suggestedQuantity,
        ratePerDay: opt.specialDailyAmount ?? opt.item.ratePerDay,
      })),
    });
  }
  return out;
}
