import {
  getWebsiteCatalog,
  isWebsiteCatalogStale,
  searchWebsiteCatalog,
  syncWebsiteCatalog,
} from "@/lib/website-catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Search / inspect the public website rental catalog (cached). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 24) || 24, 1),
      60,
    );
    const catalog = await getWebsiteCatalog();
    const items = q
      ? await searchWebsiteCatalog(q, limit)
      : catalog.items.slice(0, limit);

    return NextResponse.json({
      success: true,
      query: q,
      items,
      totalCached: catalog.items.length,
      categoryCount: catalog.categoryCount,
      syncedAt: catalog.syncedAt || null,
      stale: isWebsiteCatalogStale(catalog),
      source: catalog.source,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Catalog lookup failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Crawl partyperfecteventrental.com and refresh the cached catalog index. */
export async function POST() {
  try {
    const catalog = await syncWebsiteCatalog();
    return NextResponse.json({
      success: true,
      totalCached: catalog.items.length,
      categoryCount: catalog.categoryCount,
      syncedAt: catalog.syncedAt,
      source: catalog.source,
      stale: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Catalog sync failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
