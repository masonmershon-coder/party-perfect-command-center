import { isPorSyncConfigured } from "@/lib/por-snapshot";
import {
  productImageCacheStats,
  runProductImageIngestBatch,
} from "@/lib/product-image-ingest";
import {
  recordPorSyncError,
  recordPorSyncSuccess,
} from "@/lib/por-sync-health";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

/**
 * IMAGE-INGEST + CUTOUT subbots (batch).
 * Called after catalog sync (~10 min). Hash unchanged → skip; new → mirror → cutout.
 */
export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json(
      { error: "POR_SYNC_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await runProductImageIngestBatch();
    await recordPorSyncSuccess("catalog-images");
    const cache = await productImageCacheStats();
    return NextResponse.json({ ok: true, stats, cache });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Catalog image ingest failed.";
    await recordPorSyncError("catalog-images", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cache = await productImageCacheStats();
  return NextResponse.json({ ok: true, cache });
}
