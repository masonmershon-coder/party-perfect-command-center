import { getPorSnapshot, getPorSyncMeta } from "@/lib/por-snapshot";
import { createBookkeepingEntry, listBookkeeping } from "@/lib/storage";
import type { CreateBookkeepingInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const [bookkeeping, por] = await Promise.all([
    listBookkeeping(),
    getPorSnapshot(),
  ]);
  const porMeta = getPorSyncMeta(por);
  return NextResponse.json({
    bookkeeping,
    source: porMeta.present ? "por" : "local",
    por: porMeta,
    money: por?.money ?? null,
  });
}

export async function POST(request: Request) {
  try {
    const por = await getPorSnapshot();
    if (por) {
      return NextResponse.json(
        {
          error:
            "Bookkeeping is mirrored from Point of Rental AR (read-only). Post payments in POR.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateBookkeepingInput;

    if (!body.vendor?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: "vendor and description are required." },
        { status: 400 },
      );
    }

    const entry = await createBookkeepingEntry(body);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
