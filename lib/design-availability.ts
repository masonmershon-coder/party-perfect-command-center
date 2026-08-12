import { availableOn } from "@/lib/por-availability";
import { searchPorCatalog } from "@/lib/por-catalog";
import { getCachedProductImage, pickStagingUrl } from "@/lib/product-image-cache";
import type { ResolvedDesignProduct } from "@/lib/design-resolver";

export interface AvailabilityAdjustedProduct extends ResolvedDesignProduct {
  requestedQty: number;
  availableQty: number;
  unavailable: boolean;
  swappedFrom?: string;
  swapReason?: string;
}

const DATE_RE =
  /\b(20\d{2}-\d{2}-\d{2})|(?:on\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+20\d{2})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

/** Pull ISO date from command if present; otherwise undefined (skip date gate). */
export function extractEventDateFromCommand(command: string): string | undefined {
  const iso = command.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return undefined;
}

async function findInStockAlternative(
  item: ResolvedDesignProduct,
  dateISO: string,
): Promise<ResolvedDesignProduct | null> {
  const seed = `${item.category || ""} ${item.name}`.trim();
  const hits = await searchPorCatalog(seed, 8);
  for (const alt of hits) {
    if (alt.sku === item.sku) continue;
    const avail = await availableOn(alt.sku, dateISO);
    if (avail.available <= 0) continue;
    const cached = await getCachedProductImage(alt.sku);
    return {
      sku: alt.sku,
      name: alt.name,
      num: alt.num,
      category: alt.category || alt.categoryCode,
      ratePerDay: alt.ratePerDay,
      stagingUrl: pickStagingUrl(cached) || alt.imageUrl,
      cutoutUrl: cached?.cutoutUrl,
      mirrorUrl: cached?.mirrorUrl,
      sourceUrl: cached?.sourceUrl || alt.imageUrl,
      imageSource: cached?.cutoutUrl ? "cache" : alt.imageUrl ? "por" : "none",
      matchScore: alt.score,
      queryTerm: item.queryTerm,
    };
  }
  return null;
}

/**
 * AVAILABILITY subbot — in stock for the date? swap to closest in-stock sibling.
 */
export async function applyAvailabilityToResolved(
  items: ResolvedDesignProduct[],
  opts?: { eventDate?: string; qtyPerLine?: number },
): Promise<AvailabilityAdjustedProduct[]> {
  const dateISO = opts?.eventDate?.trim();
  const qty = Math.max(1, opts?.qtyPerLine ?? 1);
  const out: AvailabilityAdjustedProduct[] = [];

  for (const item of items) {
    if (!dateISO) {
      out.push({
        ...item,
        requestedQty: qty,
        availableQty: item.num ? 999 : 0,
        unavailable: false,
      });
      continue;
    }

    const avail = await availableOn(item.sku, dateISO);
    if (avail.available >= qty) {
      out.push({
        ...item,
        requestedQty: qty,
        availableQty: avail.available,
        unavailable: false,
      });
      continue;
    }

    const alt = await findInStockAlternative(item, dateISO);
    if (alt) {
      const altAvail = await availableOn(alt.sku, dateISO);
      out.push({
        ...alt,
        requestedQty: qty,
        availableQty: altAvail.available,
        unavailable: false,
        swappedFrom: item.name,
        swapReason: `${item.name} unavailable on ${dateISO} — using ${alt.name}`,
      });
      continue;
    }

    out.push({
      ...item,
      requestedQty: qty,
      availableQty: avail.available,
      unavailable: true,
      swapReason: `Low/no stock on ${dateISO}`,
    });
  }

  return out;
}
