import {
  listDesignAssets,
  madisonGenerateImage,
  resolveDesignImageForLlm,
} from "@/lib/design-studio";
import type { DesignAspectRatio } from "@/lib/types";
import {
  getWebsiteCatalogItemsByKeys,
  matchInventoryForDesign,
  toMatchedDesignItems,
} from "@/lib/website-catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const ASPECTS = new Set<DesignAspectRatio>([
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "auto",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      prompt?: string;
      aspectRatio?: string;
      referenceAssetId?: string;
      referenceAssetIds?: string[];
      catalogKeys?: string[];
      createdBy?: string;
      n?: number;
    } | null;

    const prompt = body?.prompt?.trim() || "";
    if (!prompt) {
      return NextResponse.json(
        { error: "Add a short description for Madison." },
        { status: 400 },
      );
    }

    const aspectRatio = ASPECTS.has(body?.aspectRatio as DesignAspectRatio)
      ? (body!.aspectRatio as DesignAspectRatio)
      : "auto";

    const allAssets = await listDesignAssets();
    const refIds = [
      ...(body?.referenceAssetIds || []),
      ...(body?.referenceAssetId ? [body.referenceAssetId] : []),
    ]
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 3);

    const referenceUrls: string[] = [];
    const sourceAssetIds: string[] = [];
    for (const id of refIds) {
      const ref = allAssets.find((a) => a.id === id);
      if (!ref) {
        return NextResponse.json(
          { error: "Reference photo not found." },
          { status: 404 },
        );
      }
      if (!ref.mimeType.startsWith("image/")) {
        return NextResponse.json(
          {
            error:
              "Pick photos as references (videos are for mood only right now).",
          },
          { status: 400 },
        );
      }
      referenceUrls.push(await resolveDesignImageForLlm(ref));
      sourceAssetIds.push(ref.id);
    }

    const catalogKeys = (body?.catalogKeys || [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 3);
    const catalogItems = await getWebsiteCatalogItemsByKeys(catalogKeys);
    for (const item of catalogItems) {
      if (referenceUrls.length >= 3) break;
      referenceUrls.push(item.imageUrl);
    }

    const matchedItems =
      catalogItems.length > 0
        ? await toMatchedDesignItems(
            catalogItems.map((item) => ({ ...item, score: 100 })),
          )
        : await matchInventoryForDesign(prompt, 6);

    // Auto-attach strong catalog photos only when no studio uploads were given.
    if (refIds.length === 0 && catalogItems.length === 0) {
      for (const match of matchedItems) {
        if (referenceUrls.length >= 3) break;
        if (!match.imageUrl) continue;
        if ((match.score ?? 0) < 50) continue;
        if (referenceUrls.includes(match.imageUrl)) continue;
        referenceUrls.push(match.imageUrl);
      }
    }

    const inventoryNote =
      matchedItems.length > 0
        ? ` Use exact Party Perfect rentals: ${matchedItems
            .slice(0, 6)
            .map((m) => m.name)
            .join("; ")}.`
        : "";

    const assets = await madisonGenerateImage({
      prompt: `${prompt}${inventoryNote}`,
      aspectRatio,
      referenceUrls,
      sourceAssetId: sourceAssetIds[0],
      sourceAssetIds: sourceAssetIds.length ? sourceAssetIds : undefined,
      matchedItems: matchedItems.length ? matchedItems : undefined,
      createdBy: body?.createdBy?.trim().slice(0, 60),
      n: body?.n,
    });

    return NextResponse.json({
      success: true,
      assets,
      matchedItems,
      referenceCount: referenceUrls.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed.";
    const status = message.includes("XAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
