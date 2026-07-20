import { createBookkeepingEntry, listBookkeeping } from "@/lib/storage";
import type { CreateBookkeepingInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const bookkeeping = await listBookkeeping();
  return NextResponse.json({ bookkeeping });
}

export async function POST(request: Request) {
  try {
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
