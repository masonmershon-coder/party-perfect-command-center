import { createHash } from "node:crypto";
import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const CACHE_KEY = "product-image-cache.json";
const META_KEY = "product-image-ingest-meta.json";

export interface ProductImageCacheEntry {
  sku: string;
  name?: string;
  /** Catalog / website URL at last ingest */
  sourceUrl: string;
  /** sha256 hex of sourceUrl — fast skip when unchanged */
  sourceUrlHash: string;
  /** sha256 hex of mirrored bytes */
  contentHash?: string;
  mirrorUrl?: string;
  mirrorPathname?: string;
  cutoutUrl?: string;
  cutoutPathname?: string;
  cutoutContentHash?: string;
  updatedAt: string;
}

interface ProductImageCacheState {
  bySku: Record<string, ProductImageCacheEntry>;
  updatedAt: string;
}

interface IngestMeta {
  cursor: number;
  lastRunAt?: string;
  lastStats?: {
    scanned: number;
    skipped: number;
    mirrored: number;
    cutouts: number;
    errors: number;
  };
}

function emptyState(): ProductImageCacheState {
  return { bySku: {}, updatedAt: new Date().toISOString() };
}

export function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function getProductImageCache(): Promise<ProductImageCacheState> {
  const raw = await readDurableJson<ProductImageCacheState>(CACHE_KEY, emptyState());
  return {
    ...emptyState(),
    ...raw,
    bySku: raw.bySku && typeof raw.bySku === "object" ? raw.bySku : {},
  };
}

export async function getCachedProductImage(
  sku: string,
): Promise<ProductImageCacheEntry | null> {
  const state = await getProductImageCache();
  const key = sku.trim();
  return state.bySku[key] || state.bySku[key.toLowerCase()] || null;
}

export async function saveProductImageCacheEntry(
  entry: ProductImageCacheEntry,
): Promise<void> {
  const state = await getProductImageCache();
  state.bySku[entry.sku] = entry;
  state.updatedAt = new Date().toISOString();
  await writeDurableJson(CACHE_KEY, state);
}

export async function getIngestMeta(): Promise<IngestMeta> {
  return readDurableJson<IngestMeta>(META_KEY, { cursor: 0 });
}

export async function saveIngestMeta(meta: IngestMeta): Promise<void> {
  await writeDurableJson(META_KEY, meta);
}

/** Prefer transparent cutout, then mirrored blob, then raw catalog URL. */
export function pickStagingUrl(entry: ProductImageCacheEntry | null): string | undefined {
  if (!entry) return undefined;
  return entry.cutoutUrl || entry.mirrorUrl || entry.sourceUrl;
}
