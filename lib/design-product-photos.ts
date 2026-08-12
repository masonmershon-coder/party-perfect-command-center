import { isDurableBlobConfigured } from "@/lib/durable-json";
import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const INDEX_KEY = "design-product-photos.json";

export interface DesignProductPhotoEntry {
  sku: string;
  name?: string;
  /** Public or API URL Madison/Fal can fetch */
  url: string;
  blobPathname?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

interface DesignProductPhotoIndex {
  entries: DesignProductPhotoEntry[];
  updatedAt: string;
}

function emptyIndex(): DesignProductPhotoIndex {
  return { entries: [], updatedAt: new Date().toISOString() };
}

function normSku(s: string): string {
  return s.trim().toLowerCase();
}

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readIndex(): Promise<DesignProductPhotoIndex> {
  const raw = await readDurableJson<DesignProductPhotoIndex>(
    INDEX_KEY,
    emptyIndex(),
  );
  return {
    ...emptyIndex(),
    ...raw,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

export async function listOwnerProductPhotos(): Promise<DesignProductPhotoEntry[]> {
  const index = await readIndex();
  return index.entries;
}

/** Owner-provided SKU photo (Design Studio upload), highest priority in getProductImage. */
export async function getOwnerProductPhoto(
  skuOrName: string,
): Promise<DesignProductPhotoEntry | null> {
  const q = skuOrName.trim();
  if (!q) return null;
  const skuKey = normSku(q);
  const nameKey = normName(q);
  const index = await readIndex();

  const bySku = index.entries.find((e) => normSku(e.sku) === skuKey);
  if (bySku) return bySku;

  return (
    index.entries.find(
      (e) => e.name && normName(e.name) === nameKey,
    ) ||
    index.entries.find(
      (e) =>
        e.name &&
        (normName(e.name).includes(nameKey) || nameKey.includes(normName(e.name))),
    ) ||
    null
  );
}

export async function saveOwnerProductPhoto(input: {
  sku: string;
  name?: string;
  bytes: Buffer;
  mimeType: string;
  uploadedBy?: string;
}): Promise<DesignProductPhotoEntry> {
  const sku = input.sku.trim();
  if (!sku) throw new Error("SKU is required for product photo upload.");

  let url: string;
  let blobPathname: string | undefined;

  if (isDurableBlobConfigured()) {
    const { put } = await import("@vercel/blob");
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    const ext =
      input.mimeType.includes("png")
        ? "png"
        : input.mimeType.includes("webp")
          ? "webp"
          : "jpg";
    const pathname = `design-product-photos/${normSku(sku)}-${Date.now()}.${ext}`;
    const blob = await put(pathname, input.bytes, {
      access: "public",
      contentType: input.mimeType,
      token,
    });
    url = blob.url;
    blobPathname = blob.pathname;
  } else {
    if (input.bytes.length > 3 * 1024 * 1024) {
      throw new Error("Configure BLOB_READ_WRITE_TOKEN for product photo uploads.");
    }
    url = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;
  }

  const entry: DesignProductPhotoEntry = {
    sku,
    name: input.name?.trim() || undefined,
    url,
    blobPathname,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uploadedBy?.slice(0, 60),
  };

  const index = await readIndex();
  const next = index.entries.filter((e) => normSku(e.sku) !== normSku(sku));
  next.unshift(entry);
  await writeDurableJson(INDEX_KEY, {
    entries: next.slice(0, 500),
    updatedAt: new Date().toISOString(),
  });

  return entry;
}
