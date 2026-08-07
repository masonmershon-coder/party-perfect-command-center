import {
  deleteSavedQuote,
  getSavedQuote,
  updateSavedQuote,
} from "@/lib/quote-queue";
import { guardIfApproving } from "@/lib/quote-guard";
import type { Quote, QuoteCustomerEvent, QuoteQueueStatus } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const quote = await getSavedQuote(id);
  if (!quote) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  return NextResponse.json({ quote });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getSavedQuote(id);
    if (!existing) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      status?: QuoteQueueStatus;
      customer?: Partial<QuoteCustomerEvent>;
      quote?: Quote;
      emailDraft?: string;
      ticketText?: string;
      createdBy?: string;
    };

    const nextQuote = body.quote ?? existing.quote;
    const nextCustomer = { ...existing.customer, ...(body.customer || {}) };
    const guard = await guardIfApproving({
      status: body.status,
      quote: nextQuote,
      eventDate: String(nextCustomer.eventDate || ""),
    });
    if (guard && !guard.ok) {
      return NextResponse.json(
        { error: "overbooked", guard },
        { status: 409 },
      );
    }

    const updated = await updateSavedQuote(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }
    return NextResponse.json({ quote: updated, guard: guard ?? undefined });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const ok = await deleteSavedQuote(id);
  if (!ok) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
