import { getOwnerProductPhoto } from "@/lib/design-product-photos";
import {
  getCachedProductImage,
  pickStagingUrl,
} from "@/lib/product-image-cache";
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

export type ProductImageSource = "owner" | "por" | "website" | "none";

export interface ProductImageResult {
  url?: string;
  cutoutUrl?: string;
  mirrorUrl?: string;
  source: ProductImageSource;
  sku?: string;
  name?: string;
}

async function enrichFromCache(
  hit: Omit<ProductImageResult, "cutoutUrl" | "mirrorUrl"> & {
    sku?: string;
  },
): Promise<ProductImageResult> {
  if (!hit.sku) return hit;
  const cached = await getCachedProductImage(hit.sku);
  if (!cached) return hit;
  return {
    ...hit,
    cutoutUrl: cached.cutoutUrl,
    mirrorUrl: cached.mirrorUrl,
    url: pickStagingUrl(cached) || hit.url,
  };
}

function rentablePor(item: PorCatalogItem): boolean {
  return isRentable({
    category: item.categoryCode || item.category,
    categoryCode: item.categoryCode,
    name: item.name,
  });
}

async function findPorCatalogItemBySku(
  sku: string,
): Promise<PorCatalogItem | null> {
  const key = sku.trim().toLowerCase();
  if (!key) return null;
  const { items } = await getPorCatalog();
  return items.find((i) => i.sku.trim().toLowerCase() === key) || null;
}

/**
 * Real product photo for a rentable SKU or name.
 * Priority: owner upload → POR catalog imageUrl (rentable) → website catalog.
 */
export async function getProductImage(
  skuOrName: string,
): Promise<ProductImageResult> {
  const query = skuOrName.trim();
  if (!query) return { source: "none" };

  const owner = await getOwnerProductPhoto(query);
  if (owner?.url) {
    return enrichFromCache({
      url: owner.url,
      source: "owner",
      sku: owner.sku,
      name: owner.name || query,
    });
  }

  const porBySku = await findPorCatalogItemBySku(query);
  const porHit =
    porBySku && rentablePor(porBySku)
      ? porBySku
      : await findPorCatalogItemByName(query, 65);
  if (
    porHit &&
    rentablePor(porHit) &&
    !porCatalogIsFee(porHit) &&
    porHit.imageUrl?.trim()
  ) {
    return enrichFromCache({
      url: porHit.imageUrl.trim(),
      source: "por",
      sku: porHit.sku,
      name: porHit.name,
    });
  }

  await ensureWebsiteCatalogFresh();
  const webHits = await searchWebsiteCatalog(query, 5);
  const best = webHits.find((h) => (h.score ?? 0) >= 35 && h.imageUrl);
  if (best?.imageUrl) {
    return enrichFromCache({
      url: best.imageUrl,
      source: "website",
      sku: best.key,
      name: best.name,
    });
  }

  return { source: "none", name: query };
}

/** Resolve multiple named items from a design command into real product URLs. */
export async function resolveProductImagesForText(
  text: string,
  limit = 6,
): Promise<ProductImageResult[]> {
  const q = text.trim();
  if (!q) return [];

  await ensureWebsiteCatalogFresh();

  const porHits = await searchPorCatalog(q, limit);
  const webHits = await searchWebsiteCatalog(q, limit);

  const seen = new Set<string>();
  const out: ProductImageResult[] = [];

  async function push(label: string, sku?: string) {
    const key = `${sku || ""}:${label}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const hit = await getProductImage(sku || label);
    if (hit.url) out.push(hit);
  }

  for (const hit of porHits) {
    if (!rentablePor(hit) || porCatalogIsFee(hit)) continue;
    await push(hit.name, hit.sku);
    if (out.length >= limit) break;
  }

  if (out.length < limit) {
    for (const hit of webHits) {
      await push(hit.name, hit.key);
      if (out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}
