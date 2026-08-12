import { isDurableBlobConfigured } from "@/lib/durable-json";
import { falRun } from "@/lib/madison-media-fal";
import { hashHex, type ProductImageCacheEntry } from "@/lib/product-image-cache";

const CUTOUT_MODEL = "fal-ai/birefnet/v2";

type CutoutOut = {
  image?: { url?: string };
  images?: Array<{ url?: string }>;
};

function falConfigured() {
  return Boolean(
    process.env.FAL_KEY?.trim() ||
      process.env.FAL_API_KEY?.trim() ||
      process.env.madisonpplflux?.trim() ||
      process.env.adisonpplflux?.trim(),
  );
}

function collectCutoutUrl(payload: CutoutOut): string | undefined {
  if (payload.image?.url) return payload.image.url;
  return payload.images?.[0]?.url;
}

/**
 * CUTOUT subbot — once per new content hash. Cached on the ProductImageCacheEntry.
 */
export async function ensureProductCutout(
  entry: ProductImageCacheEntry,
  mirrorBytes: Buffer,
): Promise<ProductImageCacheEntry> {
  const contentHash = entry.contentHash || hashHex(mirrorBytes.toString("base64").slice(0, 8192));
  if (
    entry.cutoutUrl &&
    entry.cutoutContentHash === contentHash
  ) {
    return entry;
  }

  if (!falConfigured()) {
    return { ...entry, contentHash };
  }

  const imageUrl = entry.mirrorUrl || entry.sourceUrl;
  if (!imageUrl) return { ...entry, contentHash };

  try {
    const payload = await falRun<CutoutOut>(CUTOUT_MODEL, {
      image_url: imageUrl,
      model: "General Use (Light)",
      output_format: "png",
    });
    const cutoutRemote = collectCutoutUrl(payload);
    if (!cutoutRemote) return { ...entry, contentHash };

    let cutoutUrl = cutoutRemote;
    let cutoutPathname: string | undefined;

    if (isDurableBlobConfigured()) {
      const res = await fetch(cutoutRemote, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const { put } = await import("@vercel/blob");
        const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
        const pathname = `product-cutouts/${contentHash.slice(0, 32)}.png`;
        const blob = await put(pathname, bytes, {
          access: "public",
          contentType: "image/png",
          token,
          addRandomSuffix: false,
        });
        cutoutUrl = blob.url;
        cutoutPathname = blob.pathname;
      }
    }

    return {
      ...entry,
      contentHash,
      cutoutUrl,
      cutoutPathname,
      cutoutContentHash: contentHash,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[product-image-cutout] failed for", entry.sku, err);
    return { ...entry, contentHash };
  }
}
