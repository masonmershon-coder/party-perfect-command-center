import {
  createSavedQuote,
  listSavedQuotes,
} from "@/lib/quote-queue";
import { guardIfApproving } from "@/lib/quote-guard";
import type { Quote, QuoteCustomerEvent, QuoteQueueStatus } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Shared showroom quote queue — all girls see the same list. */
export async function GET() {
  const quotes = await listSavedQuotes();
  return NextResponse.json({ quotes });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      createdBy?: string;
      status?: QuoteQueueStatus;
      customer?: Partial<QuoteCustomerEvent>;
      quote?: Quote;
      emailDraft?: string;
      ticketText?: string;
      forceOverride?: boolean;
      overrideReason?: string;
    };
    if (!body?.quote || !Array.isArray(body.quote.productLines)) {
      return NextResponse.json(
        { error: "quote with productLines is required." },
        { status: 400 },
      );
    }

    const eventDate = String(body.customer?.eventDate || "");
    const guard = await guardIfApproving({
      status: body.status,
      quote: body.quote,
      eventDate,
    });

    let overbookOverride: import("@/lib/types").SavedQuote["overbookOverride"];
    if (guard && !guard.ok) {
      const reason = String(body.overrideReason || "").trim();
      if (!body.forceOverride || reason.length < 8) {
        return NextResponse.json(
          { error: "overbooked", guard },
          { status: 409 },
        );
      }
      overbookOverride = {
        reason: reason.slice(0, 400),
        by: (body.createdBy || "showroom").slice(0, 80),
        at: new Date().toISOString(),
        summary: guard.summary,
      };
    }

    const saved = await createSavedQuote({
      createdBy: body.createdBy,
      status: body.status,
      customer: body.customer,
      quote: body.quote,
      emailDraft: body.emailDraft || "",
      ticketText: body.ticketText || "",
      overbookOverride,
    });
    return NextResponse.json({ quote: saved, guard: guard ?? undefined });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
