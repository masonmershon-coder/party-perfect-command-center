import { storeDesignUpload } from "@/lib/design-studio";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const createdBy =
      typeof form.get("createdBy") === "string"
        ? String(form.get("createdBy")).trim().slice(0, 60)
        : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a photo or video to upload." },
        { status: 400 },
      );
    }

    const mimeType = (file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED.has(mimeType) && !mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upload a photo (JPG/PNG/WEBP) or short video (MP4)." },
        { status: 400 },
      );
    }

    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Keep uploads under 12MB for phone-friendly speed." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await storeDesignUpload({
      bytes,
      mimeType,
      fileName: file.name || "upload.jpg",
      createdBy,
    });

    return NextResponse.json({ success: true, asset });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  }
}
