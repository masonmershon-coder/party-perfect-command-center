import { isPorSyncConfigured } from "@/lib/por-snapshot";
import { savePorTaxTable, type PorTaxCodeRow } from "@/lib/por-tax";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

/** ENTERPRISE: push dbo.TaxTable snapshot. Does not invent rates. */
export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json({ error: "POR_SYNC_SECRET is not configured." }, { status: 503 });
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      rows?: PorTaxCodeRow[];
      source?: string;
      syncedAt?: string;
    };
    const rows = (Array.isArray(body.rows) ? body.rows : [])
      .map((r) => ({
        code: String(r.code || "").trim(),
        name: r.name ? String(r.name).trim() : undefined,
        taxRent: Number(r.taxRent) || 0,
        taxSale: Number(r.taxSale) || 0,
        taxDw: Number(r.taxDw) || 0,
      }))
      .filter((r) => r.code);
    await savePorTaxTable({
      rows,
      source: body.source || "ENTERPRISE TaxTable",
      syncedAt: body.syncedAt || new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
