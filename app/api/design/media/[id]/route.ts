import { getRawDesignAsset } from "@/lib/design-studio";
import { isDurableBlobConfigured } from "@/lib/durable-json";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Stream a Design Studio file from the private Vercel Blob store.
 * Browser <img>/<video> src points here because private Blob URLs are not public.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const asset = await getRawDesignAsset(id);
    if (!asset) {
      return new NextResponse("Not found", { status: 404 });
    }

    if (asset.url.startsWith("data:")) {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(asset.url);
      if (!match) {
        return new NextResponse("Invalid data URI", { status: 500 });
      }
      const bytes = Buffer.from(match[2], "base64");
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": match[1],
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (asset.blobPathname && isDurableBlobConfigured()) {
      const { get } = await import("@vercel/blob");
      const result = await get(asset.blobPathname, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (!result?.stream) {
        return new NextResponse("Not found", { status: 404 });
      }
      return new NextResponse(result.stream, {
        headers: {
          "Content-Type":
            result.blob?.contentType || asset.mimeType || "application/octet-stream",
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (asset.url.startsWith("http")) {
      return NextResponse.redirect(asset.url);
    }

    return new NextResponse("Not found", { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load media.",
      },
      { status: 500 },
    );
  }
}
