import { isPorSyncConfigured } from "@/lib/por-snapshot";
import {
  clearPorCatalogCache,
  isValidPorCatalogState,
  savePorCatalog,
} from "@/lib/por-catalog";
import type { PorCatalogState } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

/**
 * ENTERPRISE sync: full active ItemFile catalog (with NUM) → Redis por-catalog.json.
 * Authorization: Bearer POR_SYNC_SECRET
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
    const body = (await request.json()) as unknown;
    if (!isValidPorCatalogState(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid catalog. Expected { items:[{sku,name,ratePerDay,qty,num?}], activeItems, source, syncedAt }.",
        },
        { status: 400 },
      );
    }

    const withNum = body.items.filter(
      (i) => i.num != null && String(i.num).trim() !== "",
    ).length;
    if (withNum < body.items.length * 0.5) {
      return NextResponse.json(
        {
          error: `Catalog missing ItemFile.NUM on most rows (${withNum}/${body.items.length}). Availability join will fail.`,
        },
        { status: 400 },
      );
    }

    const state: PorCatalogState = {
      ...body,
      activeItems: body.activeItems || body.items.length,
      syncedAt: body.syncedAt || new Date().toISOString(),
      source: body.source || "ENTERPRISE Sync-PorSnapshot",
    };
    clearPorCatalogCache();
    await savePorCatalog(state);

    return NextResponse.json({
      ok: true,
      items: state.items.length,
      withNum,
      syncedAt: state.syncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to store catalog.",
      },
      { status: 500 },
    );
  }
}
