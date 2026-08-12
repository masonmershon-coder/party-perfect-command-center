import {
  isAuthError,
  requireApiAuth,
} from "@/lib/api-auth";
import { saveOwnerProductPhoto } from "@/lib/design-product-photos";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** Owner-provided real product photo keyed to SKU (highest priority in getProductImage). */
export async function POST(request: Request) {
  const gate = await requireApiAuth("design");
  if (isAuthError(gate)) return gate;

  try {
    const form = await request.formData();
    const sku = String(form.get("sku") || "").trim();
    const name =
      typeof form.get("name") === "string"
        ? String(form.get("name")).trim().slice(0, 120)
        : undefined;
    const uploadedBy =
      typeof form.get("createdBy") === "string"
        ? String(form.get("createdBy")).trim().slice(0, 60)
        : undefined;
    const file = form.get("file");

    if (!sku) {
      return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a product photo." }, { status: 400 });
    }

    const mimeType = (file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED.has(mimeType) && !mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upload JPG, PNG, or WEBP." },
        { status: 400 },
      );
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Keep uploads under 12MB." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const entry = await saveOwnerProductPhoto({
      sku,
      name,
      bytes,
      mimeType,
      uploadedBy,
    });

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  }
}
