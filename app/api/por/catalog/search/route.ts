import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { getPorCatalog, porCatalogIsSynced, searchPorCatalog } from "@/lib/por-catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET ?q=gold+charger&limit=8 — catalog browse for Quoting tab. */
export async function GET(request: Request) {
  const gate = await requireApiAuth("por");
  if (isAuthError(gate)) return gate;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit") || 8);
    const [items, synced, catalog] = await Promise.all([
      searchPorCatalog(q, Number.isFinite(limit) ? limit : 8),
      porCatalogIsSynced(),
      getPorCatalog(),
    ]);
    return NextResponse.json({
      items,
      synced,
      itemCount: catalog.items.length,
      syncedAt: catalog.syncedAt || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
