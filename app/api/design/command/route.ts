import {
  listDesignAssets,
  madisonGenerateImage,
  prepareReferenceImageForMadison,
  storeDesignUpload,
} from "@/lib/design-studio";
import { madisonLinkInventoryForLook } from "@/lib/madison-inventory-match";
import { grokClient } from "@/lib/grok";
import type { DesignAspectRatio, DesignMatchedItem } from "@/lib/types";
import { getWebsiteCatalogItemsByKeys } from "@/lib/website-catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/** Look-board size before packing into xAI’s 3-image edit limit. */
const MAX_LOOK_BOARD = 8;
const MAX_XAI_IMAGES = 3;
const MAX_CATALOG_PICKS = 6;

/**
 * One-shot Madison command: multiple photos/videos + optional catalog picks
 * → 2 looks grounded in the desired mood board / inventory.
 */
export async function POST(request: Request) {
  try {
    // Madison may use Flux (FAL_KEY) and/or Grok Imagine (XAI_API_KEY).
    if (
      !process.env.FAL_KEY?.trim() &&
      !process.env.FAL_API_KEY?.trim() &&
      !process.env.madisonpplflux?.trim() &&
      !process.env.adisonpplflux?.trim() &&
      !process.env.XAI_API_KEY?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "No media engine configured. Add FAL_KEY (Flux photoreal) and/or XAI_API_KEY.",
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const command = String(form.get("command") || "").trim();
    const createdByRaw = form.get("createdBy");
    const createdBy =
      typeof createdByRaw === "string"
        ? createdByRaw.trim().slice(0, 60)
        : undefined;

    if (!command) {
      return NextResponse.json(
        { error: "Tell Madison what you need (one short command)." },
        { status: 400 },
      );
    }

    const catalogKeys = String(form.get("catalogKeys") || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, MAX_CATALOG_PICKS);

    const files: File[] = [];
    for (const value of form.getAll("files")) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
    const single = form.get("file");
    if (single instanceof File && single.size > 0) files.push(single);
    // Client-extracted stills from videos (so video shapes the look).
    for (const value of form.getAll("videoFrames")) {
      if (value instanceof File && value.size > 0) files.push(value);
    }

    if (files.length > MAX_LOOK_BOARD + 4) {
      return NextResponse.json(
        { error: `Keep the look board to about ${MAX_LOOK_BOARD} photos/videos.` },
        { status: 400 },
      );
    }

    const preparedImages: string[] = [];
    const sourceAssetIds: string[] = [];
    let uploadedId: string | undefined;
    let mediaKind: "image" | "video" | "mixed" | "none" = "none";
    let sawImage = false;
    let sawVideo = false;
    let boardCount = 0;

    for (const file of files) {
      const mimeType = (file.type || "application/octet-stream").toLowerCase();
      if (!ALLOWED.has(mimeType) && !mimeType.startsWith("image/")) {
        return NextResponse.json(
          { error: "Send photos or short videos from your phone." },
          { status: 400 },
        );
      }
      if (file.size > 12 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Keep each file under 12MB." },
          { status: 400 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await storeDesignUpload({
        bytes,
        mimeType,
        fileName: file.name || "phone-capture.jpg",
        createdBy,
      });
      if (!uploadedId) uploadedId = uploaded.id;
      sourceAssetIds.push(uploaded.id);
      boardCount += 1;

      if (uploaded.mimeType.startsWith("video/")) {
        sawVideo = true;
        // Visual refs come from companion videoFrames; video itself is mood + archive.
        continue;
      }

      sawImage = true;
      if (preparedImages.length < MAX_LOOK_BOARD) {
        preparedImages.push(
          await prepareReferenceImageForMadison(bytes, mimeType),
        );
      }
    }

    // Capture showroom identity refs before Madison appends catalog SKU photos.
    const showroomRefs = [...preparedImages];
    const primaryShowroomRef = showroomRefs[0];

    const linked = await madisonLinkInventoryForLook({
      command,
      imageUrl: primaryShowroomRef,
      preferredKeys: catalogKeys,
      limit: MAX_CATALOG_PICKS,
    });
    const matchedItems: DesignMatchedItem[] = linked.matchedItems;

    // Staff look-board photos stay first (identity). Website / POR product
    // shots append as SKU truth — Madison picks these herself when possible.
    for (const match of matchedItems) {
      if (preparedImages.length >= MAX_LOOK_BOARD) break;
      if (!match.imageUrl) continue;
      if (preparedImages.includes(match.imageUrl)) continue;
      preparedImages.push(match.imageUrl);
    }

    // Explicit staff picks still get forced in if vision missed them.
    const catalogItems = await getWebsiteCatalogItemsByKeys(catalogKeys);
    for (const item of catalogItems) {
      if (preparedImages.length >= MAX_LOOK_BOARD) break;
      if (preparedImages.includes(item.imageUrl)) continue;
      preparedImages.push(item.imageUrl);
    }

    const referenceUrls = preparedImages;

    if (sawImage && sawVideo) mediaKind = "mixed";
    else if (sawImage) mediaKind = "image";
    else if (sawVideo) mediaKind = "video";
    else if (referenceUrls.length > 0) mediaKind = "image";

    let prompt = command;
    if (boardCount > 0) {
      prompt = await enrichCommandForPhoto(command, boardCount);
    } else if (matchedItems.length > 0) {
      const names = matchedItems
        .slice(0, 8)
        .map((m) => m.name)
        .join("; ");
      prompt = await enrichCommandForInventory(command, names, mediaKind);
    } else if (mediaKind === "video") {
      prompt = await enrichCommandForVideo(command);
    }

    if (matchedItems.length > 0 && boardCount > 0) {
      const names = matchedItems
        .slice(0, 6)
        .map((m) => m.name)
        .join("; ");
      prompt = `${prompt}\n\nMadison matched Party Perfect catalog / POR pieces: ${names}.`;
    }

    if (preparedImages.length > MAX_XAI_IMAGES) {
      prompt = `${prompt}\n\nStaff look board has ${boardCount || showroomRefs.length} visual(s). First images are the showroom tablescape — keep those products exact. Extra refs are website product shots Madison linked for SKU truth.`;
    }

    const assets = await madisonGenerateImage({
      prompt,
      aspectRatio: "auto" as DesignAspectRatio,
      referenceUrls,
      sourceAssetId: sourceAssetIds[0],
      sourceAssetIds: sourceAssetIds.length ? sourceAssetIds : undefined,
      matchedItems: matchedItems.length ? matchedItems : undefined,
      createdBy,
      n: 2,
    });

    const all = await listDesignAssets();
    const engine = assets[0]?.generatorLabel || "Madison media";
    return NextResponse.json({
      success: true,
      command,
      promptUsed: prompt,
      uploadedId,
      mediaKind,
      boardCount,
      referenceCount: referenceUrls.length,
      preparedCount: preparedImages.length,
      matchedItems,
      madisonLinkedInventory: {
        catalogReady: linked.catalogReady,
        catalogTotal: linked.catalogTotal,
        usedVision: linked.usedVision,
        searchTerms: linked.searchTerms,
      },
      generatorId: assets[0]?.generatorId,
      generatorLabel: assets[0]?.generatorLabel,
      generatorReason: assets[0]?.generatorReason,
      engine,
      assets,
      board: all.slice(0, 24),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Madison command failed.";
    const status = message.includes("XAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

async function enrichCommandForInventory(
  command: string,
  inventoryNames: string,
  mediaKind: string,
) {
  try {
    const res = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content:
            "You write ONE Flux image-edit instruction for Party Perfect Event Rentals (Tulsa). Staff may attach real inventory photos. Instruct the model to KEEP those exact rental pieces (linens pattern/color, chairs, china, tables) — polish lighting only. Forbid inventing gardens, ballrooms, or different products. Return ONLY the edit instruction.",
        },
        {
          role: "user",
          content: `Command: ${command}\nExact / matched inventory: ${inventoryNames}\nMedia: ${mediaKind}`,
        },
      ],
      max_tokens: 220,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return (
      text ||
      `${command} — keep exact Party Perfect inventory: ${inventoryNames}. Lighting polish only; do not rebuild the tablescape.`
    );
  } catch {
    return `${command} — keep exact Party Perfect Tulsa inventory: ${inventoryNames}. Do not invent products or venues.`;
  }
}

async function enrichCommandForPhoto(command: string, boardCount: number) {
  try {
    const res = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content:
            "You write ONE Flux Kontext EDIT instruction (not a fresh scene). Staff uploaded showroom/phone photos of a real Party Perfect tablescape. Tell the model to preserve every linen, chair, table, and place setting exactly — only improve lighting/cleanup for a client proposal. Ban fantasy venues and product swaps. Return ONLY the edit instruction.",
        },
        {
          role: "user",
          content: `Look board has ${boardCount} media item(s). Staff command: ${command}`,
        },
      ],
      max_tokens: 220,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text || command;
  } catch {
    return `${command} — edit the showroom reference: keep exact linens/chairs/tables; lighting polish only; no fantasy venue rebuild.`;
  }
}

async function enrichCommandForVideo(command: string) {
  try {
    const res = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content:
            "Staff uploaded phone video of a Party Perfect setup. Write ONE still-image EDIT instruction that keeps the real rental pieces from the frames and only polishes lighting for a Tulsa client proposal. Return ONLY the instruction.",
        },
        {
          role: "user",
          content: `Command: ${command}`,
        },
      ],
      max_tokens: 200,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text || command;
  } catch {
    return `${command} — keep exact Party Perfect rentals from the video frames; lighting polish only.`;
  }
}
