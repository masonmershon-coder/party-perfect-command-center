import { isAuthError, requireOwner, requireSession } from "@/lib/server-auth";
import { getPorSnapshot, getPorSyncMeta } from "@/lib/por-snapshot";
import {
  createBookkeepingEntry,
  listAccountsReceivable,
  listBookkeeping,
} from "@/lib/storage";
import type { CreateBookkeepingInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireOwner();
  if (isAuthError(gate)) return gate;

  const [ap, arPayload, por] = await Promise.all([
    listBookkeeping(),
    listAccountsReceivable(),
    getPorSnapshot(),
  ]);
  const porMeta = getPorSyncMeta(por);
  const showAr = arPayload.source === "por" && arPayload.entries.length > 0;
  return NextResponse.json({
    bookkeeping: showAr ? arPayload.entries : ap,
    accountsPayable: ap,
    accountsReceivable: arPayload.entries,
    source: showAr ? "por" : "local",
    por: porMeta,
    money: por?.money ?? null,
  });
}

export async function POST(request: Request) {
  const gate = await requireOwner();
  if (isAuthError(gate)) return gate;

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
