import { isAuthError, requireSession } from "@/lib/server-auth";
import { checkItemAvailability, checkLinesAvailability } from "@/lib/por-crm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/por/availability?item=&date=&qty=
 * Thin wrapper over lib/por-availability (via CRM resolve sku/NUM).
 */
export async function GET(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const url = new URL(request.url);
  const item = url.searchParams.get("item")?.trim() || "";
  const date = url.searchParams.get("date")?.trim() || "";
  const qtyRaw = url.searchParams.get("qty");
  const qty = qtyRaw != null ? Number(qtyRaw) : undefined;

  if (!item || !date) {
    return NextResponse.json(
      { error: "item and date (YYYY-MM-DD) are required." },
      { status: 400 },
    );
  }

  try {
    const availability = await checkItemAvailability(item, date);
    const requested =
      qty != null && Number.isFinite(qty) && qty > 0 ? qty : undefined;
    return NextResponse.json({
      availability: {
        ...availability,
        requested,
        overbooked:
          requested != null ? requested > availability.available : undefined,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Availability check failed.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/por/availability
 * Body: { date, lines: [{ itemKey, qty }] }
 */
export async function POST(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json()) as {
      date?: string;
      lines?: Array<{ itemKey?: string; qty?: number }>;
    };
    const date = body.date?.trim() || "";
    const lines = (body.lines || [])
      .map((l) => ({
        itemKey: String(l.itemKey || "").trim(),
        qty: Number(l.qty) || 0,
      }))
      .filter((l) => l.itemKey);

    if (!date || !lines.length) {
      return NextResponse.json(
        { error: "date and lines[{itemKey,qty}] required." },
        { status: 400 },
      );
    }

    const results = await checkLinesAvailability(lines, date);
    return NextResponse.json({ date, results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Availability check failed.",
      },
      { status: 500 },
    );
  }
}
