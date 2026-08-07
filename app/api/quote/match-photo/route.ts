import { quoteCandidatesFromPhotos } from "@/lib/quote-from-photo";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Photo → candidate SKU lines for Quoting tab.
 * multipart: images[] (1+ files), mode=tablescape|handwriting, optional command
 * -> { mode, lines:[{qty,term,candidates}], searchTerms, transcribed?, usedVision }
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const modeRaw = String(form.get("mode") || "tablescape").toLowerCase();
    const mode =
      modeRaw === "handwriting" ? "handwriting" : "tablescape";
    const command =
      typeof form.get("command") === "string"
        ? String(form.get("command")).trim()
        : "";

    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (
        (key === "image" || key === "images" || key.startsWith("image")) &&
        value instanceof File &&
        value.size > 0
      ) {
        files.push(value);
      }
    }
    // Also accept repeated "images"
    const multi = form.getAll("images");
    for (const value of multi) {
      if (value instanceof File && value.size > 0 && !files.includes(value)) {
        files.push(value);
      }
    }

    if (!files.length) {
      return NextResponse.json(
        { error: "At least one image is required." },
        { status: 400 },
      );
    }

    const result = await quoteCandidatesFromPhotos({
      files: files.slice(0, 8),
      mode,
      command,
      perItem: 2,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
