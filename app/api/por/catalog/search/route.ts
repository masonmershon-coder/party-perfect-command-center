import { searchPorCatalog } from "@/lib/por-catalog";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET ?q=gold+charger&limit=8 — catalog browse for Quoting tab. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit") || 8);
    const items = await searchPorCatalog(q, Number.isFinite(limit) ? limit : 8);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
