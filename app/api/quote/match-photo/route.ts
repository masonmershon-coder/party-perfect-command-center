import { madisonLinkInventoryForLook } from "@/lib/madison-inventory-match";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Photo → Madison catalog matches for the Quoting tab.
 * POST multipart: image (file) + optional command text.
 * -> { matchedItems, searchTerms, usedVision, catalogReady }
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    const command =
      typeof form.get("command") === "string"
        ? String(form.get("command")).trim()
        : "Identify every rentable plate, charger, flatware, glass, linen, and table piece in this tablescape photo.";

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "image file is required." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const imageUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    const linked = await madisonLinkInventoryForLook({
      command,
      imageUrl,
      limit: 12,
    });

    return NextResponse.json({
      matchedItems: linked.matchedItems,
      searchTerms: linked.searchTerms,
      usedVision: linked.usedVision,
      catalogReady: linked.catalogReady,
      catalogTotal: linked.catalogTotal,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
