import { createHash } from "node:crypto";
import { isDurableBlobConfigured } from "@/lib/durable-json";
import { getPorCatalog, porCatalogIsFee } from "@/lib/por-catalog";
import { isRentable } from "@/lib/por-rentable";
import type { PorCatalogItem } from "@/lib/types";
import { ensureWebsiteCatalogFresh, searchWebsiteCatalog } from "@/lib/website-catalog";
import { ensureProductCutout } from "@/lib/product-image-cutout";
import {
  getCachedProductImage,
  getIngestMeta,
  getProductImageCache,
  hashHex,
  saveIngestMeta,
  saveProductImageCacheEntry,
  type ProductImageCacheEntry,
} from "@/lib/product-image-cache";

const BATCH_LIMIT = 40;

function rentable(item: PorCatalogItem): boolean {
  return (
    isRentable({
      category: item.categoryCode || item.category,
      categoryCode: item.categoryCode,
      name: item.name,
    }) && !porCatalogIsFee(item)
  );
}

async function mirrorToBlob(
  sku: string,
  bytes: Buffer,
  mimeType: string,
): Promise<{ url: string; pathname?: string }> {
  if (!isDurableBlobConfigured()) {
    return {
      url: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };
  }
  const { put } = await import("@vercel/blob");
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const safeSku = sku.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const pathname = `product-catalog/${safeSku}.${ext}`;
  const blob = await put(pathname, bytes, {
    access: "public",
    contentType: mimeType,
    token,
    addRandomSuffix: false,
  });
  return { url: blob.url, pathname: blob.pathname };
}

async function fetchImageBytes(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "PartyPerfectCatalogIngest/1.0" },
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const mimeType = (res.headers.get("content-type") || "image/jpeg")
    .split(";")[0]
    .trim();
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType };
}

function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function resolveSourceUrl(item: PorCatalogItem): Promise<string | undefined> {
  if (item.imageUrl?.trim()) return item.imageUrl.trim();
  await ensureWebsiteCatalogFresh();
  const hits = await searchWebsiteCatalog(item.name, 3);
  const best = hits.find((h) => (h.score ?? 0) >= 50 && h.imageUrl);
  return best?.imageUrl;
}

/**
 * IMAGE-INGEST subbot — hash unchanged → skip; new/changed → mirror once → cutout once.
 * Processes up to BATCH_LIMIT rentable SKUs per call (round-robin cursor).
 */
export async function runProductImageIngestBatch(): Promise<{
  scanned: number;
  skipped: number;
  mirrored: number;
  cutouts: number;
  errors: number;
}> {
  const stats = { scanned: 0, skipped: 0, mirrored: 0, cutouts: 0, errors: 0 };
  const { items } = await getPorCatalog();
  const rentableItems = items.filter(rentable);
  if (rentableItems.length === 0) return stats;

  const meta = await getIngestMeta();
  let cursor = meta.cursor % rentableItems.length;
  let processed = 0;

  while (processed < BATCH_LIMIT && stats.scanned < rentableItems.length) {
    const item = rentableItems[cursor];
    cursor = (cursor + 1) % rentableItems.length;
    stats.scanned += 1;
    processed += 1;

    try {
      const sourceUrl = await resolveSourceUrl(item);
      if (!sourceUrl) {
        stats.skipped += 1;
        continue;
      }

      const sourceUrlHash = hashHex(sourceUrl);
      const cached = await getCachedProductImage(item.sku);

      if (
        cached &&
        cached.sourceUrlHash === sourceUrlHash &&
        cached.mirrorUrl &&
        cached.cutoutUrl
      ) {
        stats.skipped += 1;
        continue;
      }

      if (
        cached &&
        cached.sourceUrlHash === sourceUrlHash &&
        cached.mirrorUrl &&
        cached.contentHash
      ) {
        const withCutout = await ensureProductCutout(cached, Buffer.alloc(0));
        if (withCutout.cutoutUrl && !cached.cutoutUrl) stats.cutouts += 1;
        else stats.skipped += 1;
        await saveProductImageCacheEntry(withCutout);
        continue;
      }

      const { bytes, mimeType } = await fetchImageBytes(sourceUrl);
      const hash = contentHash(bytes);

      if (cached?.contentHash === hash && cached.mirrorUrl) {
        const entry: ProductImageCacheEntry = {
          ...cached,
          sourceUrl,
          sourceUrlHash,
          name: item.name,
          updatedAt: new Date().toISOString(),
        };
        const withCutout = cached.cutoutUrl
          ? entry
          : await ensureProductCutout(entry, bytes);
        if (!cached.cutoutUrl && withCutout.cutoutUrl) stats.cutouts += 1;
        else stats.skipped += 1;
        await saveProductImageCacheEntry(withCutout);
        continue;
      }

      const mirrored = await mirrorToBlob(item.sku, bytes, mimeType);
      stats.mirrored += 1;

      let entry: ProductImageCacheEntry = {
        sku: item.sku,
        name: item.name,
        sourceUrl,
        sourceUrlHash,
        contentHash: hash,
        mirrorUrl: mirrored.url,
        mirrorPathname: mirrored.pathname,
        updatedAt: new Date().toISOString(),
      };

      entry = await ensureProductCutout(entry, bytes);
      if (entry.cutoutUrl) stats.cutouts += 1;
      await saveProductImageCacheEntry(entry);
    } catch (err) {
      stats.errors += 1;
      console.error("[product-image-ingest]", item.sku, err);
    }
  }

  await saveIngestMeta({
    cursor,
    lastRunAt: new Date().toISOString(),
    lastStats: stats,
  });

  void getProductImageCache();
  return stats;
}

export async function productImageCacheStats() {
  const state = await getProductImageCache();
  const entries = Object.values(state.bySku);
  return {
    total: entries.length,
    withMirror: entries.filter((e) => e.mirrorUrl).length,
    withCutout: entries.filter((e) => e.cutoutUrl).length,
    updatedAt: state.updatedAt,
  };
}
