import {
  listDesignAssets,
  madisonGenerateImage,
  prepareReferenceImageForMadison,
  storeDesignUpload,
} from "@/lib/design-studio";
import { grokClient } from "@/lib/grok";
import type { DesignAspectRatio, DesignMatchedItem } from "@/lib/types";
import {
  getWebsiteCatalogItemsByKeys,
  matchInventoryForDesign,
  toMatchedDesignItems,
} from "@/lib/website-catalog";
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

    const catalogItems = await getWebsiteCatalogItemsByKeys(catalogKeys);
    for (const item of catalogItems) {
      if (preparedImages.length >= MAX_LOOK_BOARD) break;
      preparedImages.push(item.imageUrl);
    }

    let matchedItems: DesignMatchedItem[] =
      catalogItems.length > 0
        ? await toMatchedDesignItems(
            catalogItems.map((item) => ({ ...item, score: 100 })),
          )
        : await matchInventoryForDesign(command, 6);

    // Strong catalog auto-refs only when the look board is empty.
    if (preparedImages.length === 0 && catalogItems.length === 0) {
      for (const match of matchedItems) {
        if (preparedImages.length >= MAX_XAI_IMAGES) break;
        if (!match.imageUrl) continue;
        if ((match.score ?? 0) < 50) continue;
        if (preparedImages.includes(match.imageUrl)) continue;
        preparedImages.push(match.imageUrl);
      }
    }

    const referenceUrls = preparedImages;

    if (sawImage && sawVideo) mediaKind = "mixed";
    else if (sawImage) mediaKind = "image";
    else if (sawVideo) mediaKind = "video";
    else if (referenceUrls.length > 0) mediaKind = "image";

    let prompt = command;
    if (matchedItems.length > 0) {
      const names = matchedItems
        .slice(0, 8)
        .map((m) => m.name)
        .join("; ");
      prompt = await enrichCommandForInventory(command, names, mediaKind);
    } else if (mediaKind === "video") {
      prompt = await enrichCommandForVideo(command);
    } else if (mediaKind === "image" || mediaKind === "mixed") {
      prompt = await enrichCommandForPhoto(command, boardCount);
    }

    if (preparedImages.length > MAX_XAI_IMAGES) {
      prompt = `${prompt}\n\nStaff uploaded a multi-photo/video look board (${preparedImages.length} visuals). Honor every piece when composing the desired look.`;
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
            "You write one Grok Imagine prompt for Party Perfect Event Rentals (Tulsa). The staff will attach real inventory photos and/or a look board. Instruct the model to use those exact rental pieces (linens, china, chairs, bars, etc.) so the client proposal matches what we actually rent — photoreal, not generic AI décor. Return ONLY the prompt text.",
        },
        {
          role: "user",
          content: `Command: ${command}\nExact / matched inventory: ${inventoryNames}\nMedia: ${mediaKind}`,
        },
      ],
      max_tokens: 260,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return (
      text ||
      `${command} — use exact Party Perfect inventory: ${inventoryNames}`
    );
  } catch {
    return `${command} — photoreal Party Perfect Tulsa using exact inventory: ${inventoryNames}`;
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
            "You write one Grok Imagine image prompt for Party Perfect Event Rentals (Tulsa). Staff attached a look board of photos/video frames showing the desired vibe and pieces. Merge those references into one photoreal client-proposal look. Keep real rental inventory (linens, china, tents, tables, dance floor). Return ONLY the prompt text.",
        },
        {
          role: "user",
          content: `Look board has ${boardCount} media item(s). Command: ${command}`,
        },
      ],
      max_tokens: 240,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text || command;
  } catch {
    return `${command} — photoreal Party Perfect Event Rentals Tulsa showroom quality from staff look board`;
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
            "Staff uploaded phone video of an event/setup. Write ONE still-image Grok Imagine prompt that matches their command and a polished Party Perfect Tulsa rental look. Return ONLY the prompt text.",
        },
        {
          role: "user",
          content: `Command: ${command}`,
        },
      ],
      max_tokens: 220,
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text || command;
  } catch {
    return `${command} — photoreal Party Perfect Event Rentals Tulsa, from phone video mood`;
  }
}
