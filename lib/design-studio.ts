import { isDurableBlobConfigured } from "@/lib/durable-json";
import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import type {
  DesignAspectRatio,
  DesignAsset,
  DesignMatchedItem,
  DesignStudioState,
} from "@/lib/types";

export { DESIGN_PRESETS } from "@/lib/design-presets";

const STUDIO_KEY = "design-studio.json";
const MAX_ASSETS = 80;
const MAX_INLINE_BYTES = 3.5 * 1024 * 1024;

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}

function emptyState(): DesignStudioState {
  return { assets: [], updatedAt: new Date().toISOString() };
}

function mediaApiUrl(id: string) {
  return `/api/design/media/${id}`;
}

/** Normalize stored assets so the UI can load private Blob files. */
function withClientUrl(asset: DesignAsset): DesignAsset {
  if (asset.url.startsWith("data:")) return asset;
  if (asset.blobPathname) {
    return { ...asset, url: mediaApiUrl(asset.id) };
  }
  return asset;
}

export async function listDesignAssets(): Promise<DesignAsset[]> {
  const state = await readDurableJson<DesignStudioState>(
    STUDIO_KEY,
    emptyState(),
  );
  const assets = Array.isArray(state.assets) ? state.assets : [];
  return assets.map(withClientUrl);
}

async function saveAssets(assets: DesignAsset[]) {
  const next: DesignStudioState = {
    assets: assets.slice(0, MAX_ASSETS),
    updatedAt: new Date().toISOString(),
  };
  await writeDurableJson(STUDIO_KEY, next);
  return next.assets.map(withClientUrl);
}

export async function getDesignAsset(id: string): Promise<DesignAsset | null> {
  const assets = await listDesignAssets();
  return assets.find((a) => a.id === id) || null;
}

/** Raw asset from store (includes blobPathname) without forcing URL rewrite twice. */
export async function getRawDesignAsset(
  id: string,
): Promise<DesignAsset | null> {
  const state = await readDurableJson<DesignStudioState>(
    STUDIO_KEY,
    emptyState(),
  );
  const assets = Array.isArray(state.assets) ? state.assets : [];
  return assets.find((a) => a.id === id) || null;
}

export async function addDesignAsset(
  asset: Omit<DesignAsset, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<DesignAsset> {
  const state = await readDurableJson<DesignStudioState>(
    STUDIO_KEY,
    emptyState(),
  );
  const prior = Array.isArray(state.assets) ? state.assets : [];
  const id = asset.id || crypto.randomUUID();
  const row: DesignAsset = {
    ...asset,
    id,
    url: asset.blobPathname ? mediaApiUrl(id) : asset.url,
    createdAt: asset.createdAt || new Date().toISOString(),
  };
  const saved = await saveAssets([row, ...prior.filter((a) => a.id !== id)]);
  return saved.find((a) => a.id === id) || withClientUrl(row);
}

export async function deleteDesignAsset(id: string) {
  const state = await readDurableJson<DesignStudioState>(
    STUDIO_KEY,
    emptyState(),
  );
  const prior = Array.isArray(state.assets) ? state.assets : [];
  const target = prior.find((a) => a.id === id);
  if (target?.blobPathname && isDurableBlobConfigured()) {
    try {
      const { del } = await import("@vercel/blob");
      await del(target.blobPathname, { token: blobToken() });
    } catch {
      // ignore blob delete failures
    }
  }
  await saveAssets(prior.filter((a) => a.id !== id));
}

function blobConfigured() {
  return isDurableBlobConfigured();
}

/**
 * Store upload bytes in private Vercel Blob (store requires private access),
 * or fall back to inline data URI for small images.
 */
export async function storeDesignUpload(input: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  createdBy?: string;
}): Promise<DesignAsset> {
  const id = crypto.randomUUID();
  const normalized = await normalizeDesignUploadBytes(
    input.bytes,
    input.mimeType,
  );
  let fileName = input.fileName;
  if (normalized.fileNameHint) {
    fileName = fileName.replace(/\.(heic|heif|avif)$/i, "") + normalized.fileNameHint;
  }
  const safeName = fileName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  let url: string;
  let blobPathname: string | undefined;

  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    const pathname = `pp-data/design/${id}-${safeName}`;
    await put(pathname, normalized.bytes, {
      access: "private",
      contentType: normalized.mimeType,
      addRandomSuffix: false,
      token: blobToken(),
    });
    blobPathname = pathname;
    url = mediaApiUrl(id);
  } else {
    if (!normalized.mimeType.startsWith("image/")) {
      throw new Error(
        "Video uploads need Vercel Blob storage. Photos can still upload without Blob.",
      );
    }
    if (normalized.bytes.length > MAX_INLINE_BYTES) {
      throw new Error(
        "Photo is too large for inline storage. Compress under ~3.5MB or enable Blob.",
      );
    }
    url = `data:${normalized.mimeType};base64,${normalized.bytes.toString("base64")}`;
  }

  return addDesignAsset({
    id,
    kind: "upload",
    mimeType: normalized.mimeType,
    url,
    blobPathname,
    fileName,
    createdBy: input.createdBy,
  });
}

/** Detect real image type from bytes (Mac often sends blank/octet-stream MIME). */
function sniffImageMime(bytes: Buffer): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12).toLowerCase();
    if (
      brand.includes("heic") ||
      brand.includes("heif") ||
      brand.includes("mif1") ||
      brand.includes("msf1")
    ) {
      return "image/heic";
    }
    if (brand.includes("avif")) return "image/avif";
  }
  return null;
}

function isHeifLike(mime: string): boolean {
  return (
    mime.includes("heic") ||
    mime.includes("heif") ||
    mime.includes("mif1") ||
    mime.includes("msf1")
  );
}

/** WASM HEIC decoder — sharp’s Vercel build usually lacks HEVC/HEIF. */
async function decodeHeicToJpegBuffer(bytes: Buffer): Promise<Buffer> {
  const convert = (await import("heic-convert")).default;
  const out = await convert({
    buffer: bytes,
    format: "JPEG",
    quality: 0.92,
  });
  return Buffer.from(out);
}

/**
 * Shrink + convert phone/Mac photos to a JPEG data URI xAI Imagine accepts.
 * Mac Photos HEIC needs heic-convert (sharp on Vercel can’t decode HEVC).
 */
export async function prepareReferenceImageForMadison(
  bytes: Buffer,
  mimeHint?: string,
): Promise<string> {
  const sniffed = sniffImageMime(bytes);
  const hint = (mimeHint || "")
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  const mime = sniffed || (hint.startsWith("image/") ? hint : "");

  let working = bytes;
  if (isHeifLike(mime) || (!mime && sniffImageMime(bytes) === "image/heic")) {
    try {
      working = await decodeHeicToJpegBuffer(bytes);
    } catch (err) {
      console.error("[design-studio] HEIC convert failed:", err);
      throw new Error(
        "Couldn’t read that HEIC photo. On Mac: right-click → Quick Actions → Convert Image → JPEG, then upload again.",
      );
    }
  }

  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(working, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const maxEdge = 1536;
    if ((meta.width || 0) > maxEdge || (meta.height || 0) > maxEdge) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (out.length > 4.5 * 1024 * 1024) {
      const smaller = await sharp(out)
        .resize({ width: 1280, height: 1280, fit: "inside" })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      return `data:image/jpeg;base64,${smaller.toString("base64")}`;
    }
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (err) {
    // AVIF sometimes works in sharp; if not, say so clearly
    if (mime.includes("avif")) {
      console.error("[design-studio] AVIF convert failed:", err);
      throw new Error(
        "Couldn’t read that AVIF photo. Export as JPG from Photos and try again.",
      );
    }
    if (
      (mime === "image/jpeg" ||
        mime === "image/png" ||
        mime === "image/webp" ||
        working !== bytes) &&
      working.length <= MAX_INLINE_BYTES
    ) {
      const outMime = working !== bytes ? "image/jpeg" : mime || "image/jpeg";
      return `data:${outMime};base64,${working.toString("base64")}`;
    }
    throw new Error(
      "Couldn’t prepare that photo for Madison. Try a smaller JPG or PNG (under ~4MB).",
    );
  }
}

/** Normalize upload bytes for storage (HEIC → JPEG) so Studio previews work. */
export async function normalizeDesignUploadBytes(
  bytes: Buffer,
  mimeHint?: string,
): Promise<{ bytes: Buffer; mimeType: string; fileNameHint?: string }> {
  const sniffed = sniffImageMime(bytes);
  const hint = (mimeHint || "")
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  const mime = sniffed || (hint.startsWith("image/") ? hint : "");

  if (isHeifLike(mime)) {
    const jpeg = await decodeHeicToJpegBuffer(bytes);
    return { bytes: jpeg, mimeType: "image/jpeg", fileNameHint: ".jpg" };
  }

  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return { bytes, mimeType: mime };
  }

  if (mime.startsWith("image/")) {
    try {
      const sharp = (await import("sharp")).default;
      const jpeg = await sharp(bytes, { failOn: "none" })
        .rotate()
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return { bytes: jpeg, mimeType: "image/jpeg", fileNameHint: ".jpg" };
    } catch {
      return { bytes, mimeType: mime || "application/octet-stream" };
    }
  }

  return { bytes, mimeType: mime || "application/octet-stream" };
}

/** Load a stored photo as a data URI so xAI Imagine can edit it (private Blob URLs are not fetchable by xAI). */
export async function resolveDesignImageForLlm(
  asset: DesignAsset,
): Promise<string> {
  if (asset.url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(asset.url);
    if (!match) return asset.url;
    return prepareReferenceImageForMadison(
      Buffer.from(match[2], "base64"),
      match[1],
    );
  }

  if (asset.blobPathname && blobConfigured()) {
    const { get } = await import("@vercel/blob");
    const result = await get(asset.blobPathname, {
      access: "private",
      token: blobToken(),
    });
    if (!result?.stream) {
      throw new Error("Could not load the reference photo from storage.");
    }
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    const mime = result.blob?.contentType || asset.mimeType || "image/jpeg";
    return prepareReferenceImageForMadison(buf, mime);
  }

  // Legacy public URL
  if (asset.url.startsWith("http")) {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error("Could not load the reference photo.");
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || asset.mimeType;
    return prepareReferenceImageForMadison(buf, mime);
  }

  throw new Error("Reference photo is not available for Madison.");
}

async function persistGeneratedImage(input: {
  sourceUrl: string;
  prompt: string;
  aspectRatio: DesignAspectRatio;
  sourceAssetId?: string;
  sourceAssetIds?: string[];
  matchedItems?: DesignMatchedItem[];
  createdBy?: string;
  generatorId?: string;
  generatorLabel?: string;
  generatorReason?: string;
  mimeTypeHint?: string;
}): Promise<DesignAsset> {
  const id = crypto.randomUUID();
  let url = input.sourceUrl;
  let mimeType = input.mimeTypeHint || "image/jpeg";
  let blobPathname: string | undefined;

  try {
    if (input.sourceUrl.startsWith("data:")) {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(input.sourceUrl);
      if (match && blobConfigured()) {
        mimeType = match[1];
        const buf = Buffer.from(match[2], "base64");
        const { put } = await import("@vercel/blob");
        const pathname = `pp-data/design/${id}-generated.jpg`;
        await put(pathname, buf, {
          access: "private",
          contentType: mimeType,
          addRandomSuffix: false,
          token: blobToken(),
        });
        blobPathname = pathname;
        url = mediaApiUrl(id);
      }
    } else {
      const res = await fetch(input.sourceUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || "image/jpeg";
        mimeType = ct;
        if (blobConfigured()) {
          const { put } = await import("@vercel/blob");
          const pathname = `pp-data/design/${id}-generated.jpg`;
          await put(pathname, buf, {
            access: "private",
            contentType: ct,
            addRandomSuffix: false,
            token: blobToken(),
          });
          blobPathname = pathname;
          url = mediaApiUrl(id);
        } else if (buf.length <= MAX_INLINE_BYTES) {
          url = `data:${ct};base64,${buf.toString("base64")}`;
        }
      }
    }
  } catch {
    // keep temporary xAI URL if persist fails
  }

  return addDesignAsset({
    id,
    kind: "generated",
    mimeType,
    url,
    blobPathname,
    fileName: `madison-${id.slice(0, 8)}.${mimeType.includes("video") ? "mp4" : "jpg"}`,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    sourceAssetId: input.sourceAssetId,
    sourceAssetIds: input.sourceAssetIds,
    matchedItems: input.matchedItems,
    createdBy: input.createdBy,
    generatorId: input.generatorId,
    generatorLabel: input.generatorLabel,
    generatorReason: input.generatorReason,
  });
}

function dataUriToBuffer(dataUri: string): Buffer | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUri.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

/**
 * xAI edits accept at most 3 images. If Madison got a larger look-board,
 * pack extras into a contact-sheet so every photo/video-frame still counts.
 */
export async function packReferenceImagesForMadison(
  referenceUrls: string[],
): Promise<string[]> {
  const refs = referenceUrls.map((u) => u.trim()).filter(Boolean).slice(0, 8);
  if (refs.length <= 3) return refs;

  const buffers: Buffer[] = [];
  for (const url of refs) {
    if (url.startsWith("data:")) {
      const buf = dataUriToBuffer(url);
      if (buf) buffers.push(buf);
      continue;
    }
    if (url.startsWith("http")) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) buffers.push(Buffer.from(await res.arrayBuffer()));
      } catch {
        // skip failed catalog fetch
      }
    }
  }
  if (buffers.length <= 3) {
    return refs.slice(0, 3);
  }

  try {
    const sharp = (await import("sharp")).default;
    const cols = buffers.length <= 4 ? 2 : 3;
    const rows = Math.ceil(buffers.length / cols);
    const cell = 512;
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const tile = await sharp(buffers[i], { failOn: "none" })
        .rotate()
        .resize(cell, cell, { fit: "cover" })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      tiles.push({
        input: tile,
        left: (i % cols) * cell,
        top: Math.floor(i / cols) * cell,
      });
    }
    const sheet = await sharp({
      create: {
        width: cols * cell,
        height: rows * cell,
        channels: 3,
        background: { r: 18, g: 18, b: 18 },
      },
    })
      .composite(tiles)
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const sheetUri = `data:image/jpeg;base64,${sheet.toString("base64")}`;
    // Contact sheet + first two close-ups (within xAI’s 3-image limit).
    return [sheetUri, refs[0], refs[1]].filter(Boolean).slice(0, 3);
  } catch (err) {
    console.error("[design-studio] contact sheet failed:", err);
    return refs.slice(0, 3);
  }
}

/**
 * Madison auto-picks the best media engine (Flux photoreal when FAL_KEY is set,
 * else Grok Imagine), runs it, and stores results on the Design board.
 */
export async function madisonGenerateImage(input: {
  prompt: string;
  aspectRatio?: DesignAspectRatio;
  /** @deprecated prefer referenceUrls */
  referenceUrl?: string;
  referenceUrls?: string[];
  sourceAssetId?: string;
  sourceAssetIds?: string[];
  matchedItems?: DesignMatchedItem[];
  createdBy?: string;
  n?: number;
  goal?: "proposal" | "social" | "auto";
  preferVideo?: boolean;
}): Promise<DesignAsset[]> {
  const { madisonCreateMedia } = await import("@/lib/madison-media");

  const basePrompt = input.prompt.trim();
  if (!basePrompt) throw new Error("Describe what you want Madison to create.");

  const aspectRatio = input.aspectRatio || "auto";
  const n = Math.min(Math.max(input.n ?? 2, 1), 4);
  const rawRefs = [
    ...(input.referenceUrls || []),
    ...(input.referenceUrl ? [input.referenceUrl] : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean);

  // Pack large look boards for engines with low ref limits; Flux edit can take more.
  const packedForXai = await packReferenceImagesForMadison(rawRefs);
  const refsForJob =
    rawRefs.length > 3 ? rawRefs.slice(0, 8) : packedForXai.length ? packedForXai : rawRefs;

  const media = await madisonCreateMedia({
    prompt: basePrompt,
    aspectRatio,
    referenceUrls: refsForJob,
    n,
    goal: input.goal || "proposal",
    preferVideo: input.preferVideo,
  });

  const assets: DesignAsset[] = [];
  for (const sourceUrl of media.urls) {
    const isVideo = /\.mp4(\?|$)/i.test(sourceUrl) || media.toolId === "kling-video";
    assets.push(
      await persistGeneratedImage({
        sourceUrl,
        prompt: basePrompt,
        aspectRatio,
        sourceAssetId: input.sourceAssetId,
        sourceAssetIds: input.sourceAssetIds,
        matchedItems: input.matchedItems,
        createdBy: input.createdBy,
        generatorId: media.toolId,
        generatorLabel: media.toolLabel,
        generatorReason: media.reason,
        mimeTypeHint: isVideo ? "video/mp4" : "image/jpeg",
      }),
    );
  }

  if (assets.length === 0) {
    throw new Error("Could not save generated images.");
  }
  return assets;
}
