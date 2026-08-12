import {
  getCachedProductImage,
  pickStagingUrl,
  type ProductImageCacheEntry,
} from "@/lib/product-image-cache";
import { getOwnerProductPhoto } from "@/lib/design-product-photos";
import {
  findPorCatalogItemByName,
  getPorCatalog,
  porCatalogIsFee,
  searchPorCatalog,
} from "@/lib/por-catalog";
import { isRentable } from "@/lib/por-rentable";
import type { PorCatalogItem } from "@/lib/types";
import {
  ensureWebsiteCatalogFresh,
  searchWebsiteCatalog,
} from "@/lib/website-catalog";

export interface ResolvedDesignProduct {
  sku: string;
  name: string;
  num?: string;
  category?: string;
  ratePerDay?: number;
  /** Best URL for FAL staging — cutout > mirror > catalog */
  stagingUrl?: string;
  mirrorUrl?: string;
  cutoutUrl?: string;
  sourceUrl?: string;
  imageSource: "cache" | "owner" | "por" | "website" | "none";
  matchScore: number;
  queryTerm: string;
}

const SCENE_NOISE =
  /\b(tablescape|garden|wedding|reception|party|event|outdoor|indoor|golden hour|tulsa|look|style|vibe|mood|setup|scene|background|venue|ballroom|backyard|patio|blush and gold|gold and white)\b/gi;

/** Fast/local phrase split — no LLM. */
export function extractProductPhrases(command: string): string[] {
  const cleaned = command
    .replace(SCENE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned
    .split(/[,+]|(?:\band\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (parts.length === 0 && command.trim()) {
    return [command.trim()];
  }
  return parts.slice(0, 8);
}

function rentable(item: PorCatalogItem): boolean {
  return (
    isRentable({
      category: item.categoryCode || item.category,
      categoryCode: item.categoryCode,
      name: item.name,
    }) && !porCatalogIsFee(item)
  );
}

async function resolvePhrase(term: string): Promise<ResolvedDesignProduct | null> {
  const query = term.trim();
  if (!query) return null;

  const owner = await getOwnerProductPhoto(query);
  if (owner?.url) {
    const cached = owner.sku ? await getCachedProductImage(owner.sku) : null;
    return {
      sku: owner.sku,
      name: owner.name || query,
      stagingUrl: pickStagingUrl(cached) || owner.url,
      cutoutUrl: cached?.cutoutUrl,
      mirrorUrl: cached?.mirrorUrl,
      sourceUrl: owner.url,
      imageSource: cached?.cutoutUrl ? "cache" : "owner",
      matchScore: 100,
      queryTerm: query,
    };
  }

  const porHits = await searchPorCatalog(query, 4);
  const porBest = porHits.find((h) => rentable(h) && h.score >= 35);
  if (porBest) {
    const cached = await getCachedProductImage(porBest.sku);
    const stagingUrl =
      pickStagingUrl(cached) || porBest.imageUrl?.trim() || undefined;
    return {
      sku: porBest.sku,
      name: porBest.name,
      num: porBest.num,
      category: porBest.category || porBest.categoryCode,
      ratePerDay: porBest.ratePerDay,
      stagingUrl,
      cutoutUrl: cached?.cutoutUrl,
      mirrorUrl: cached?.mirrorUrl,
      sourceUrl: cached?.sourceUrl || porBest.imageUrl,
      imageSource: cached?.cutoutUrl
        ? "cache"
        : porBest.imageUrl
          ? "por"
          : "none",
      matchScore: porBest.score,
      queryTerm: query,
    };
  }

  await ensureWebsiteCatalogFresh();
  const webHits = await searchWebsiteCatalog(query, 4);
  const webBest = webHits.find((h) => (h.score ?? 0) >= 35);
  if (webBest) {
    const full = await findPorCatalogItemByName(webBest.name, 55);
    const sku = full?.sku || webBest.key;
    const cached = sku ? await getCachedProductImage(sku) : null;
    return {
      sku,
      name: webBest.name,
      num: full?.num,
      category: webBest.categoryName,
      ratePerDay: full?.ratePerDay,
      stagingUrl: pickStagingUrl(cached) || webBest.imageUrl,
      cutoutUrl: cached?.cutoutUrl,
      mirrorUrl: cached?.mirrorUrl,
      sourceUrl: cached?.sourceUrl || webBest.imageUrl,
      imageSource: cached?.cutoutUrl ? "cache" : "website",
      matchScore: webBest.score ?? 70,
      queryTerm: query,
    };
  }

  return null;
}

/**
 * RESOLVER subbot — names → real SKUs + cutout/mirror URLs (local, no LLM).
 */
export async function resolveDesignProducts(
  command: string,
): Promise<ResolvedDesignProduct[]> {
  const phrases = extractProductPhrases(command);
  const seen = new Set<string>();
  const out: ResolvedDesignProduct[] = [];

  for (const phrase of phrases) {
    const hit = await resolvePhrase(phrase);
    if (!hit?.sku) continue;
    const key = hit.sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }

  if (out.length === 0) {
    const broad = await searchPorCatalog(command, 6);
    for (const row of broad) {
      if (!rentable(row)) continue;
      if (seen.has(row.sku.toLowerCase())) continue;
      seen.add(row.sku.toLowerCase());
      const cached = await getCachedProductImage(row.sku);
      out.push({
        sku: row.sku,
        name: row.name,
        num: row.num,
        category: row.category || row.categoryCode,
        ratePerDay: row.ratePerDay,
        stagingUrl: pickStagingUrl(cached) || row.imageUrl,
        cutoutUrl: cached?.cutoutUrl,
        mirrorUrl: cached?.mirrorUrl,
        sourceUrl: cached?.sourceUrl || row.imageUrl,
        imageSource: cached?.cutoutUrl ? "cache" : row.imageUrl ? "por" : "none",
        matchScore: row.score,
        queryTerm: command,
      });
      if (out.length >= 6) break;
    }
  }

  return out;
}

export function resolverConfidence(
  command: string,
  resolved: ResolvedDesignProduct[],
): number {
  if (resolved.length === 0) return 0;
  const phrases = extractProductPhrases(command);
  const withImages = resolved.filter((r) => r.stagingUrl).length;
  const avgScore =
    resolved.reduce((s, r) => s + r.matchScore, 0) / resolved.length;
  let score = avgScore * 0.6 + withImages * 15;
  if (phrases.length > 0 && resolved.length >= Math.min(phrases.length, 3)) {
    score += 20;
  }
  return Math.min(100, Math.round(score));
}

/** For ops/debug — load cache entry by SKU */
export async function getResolvedCacheEntry(
  sku: string,
): Promise<ProductImageCacheEntry | null> {
  return getCachedProductImage(sku);
}

/** Warm resolver with full catalog context (read-only). */
export async function catalogResolverReady(): Promise<boolean> {
  const { items } = await getPorCatalog();
  return items.length > 0;
}
