import {
  createSavedQuote,
  listSavedQuotes,
} from "@/lib/quote-queue";
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
    };
    if (!body?.quote || !Array.isArray(body.quote.productLines)) {
      return NextResponse.json(
        { error: "quote with productLines is required." },
        { status: 400 },
      );
    }
    const saved = await createSavedQuote({
      createdBy: body.createdBy,
      status: body.status,
      customer: body.customer,
      quote: body.quote,
      emailDraft: body.emailDraft || "",
      ticketText: body.ticketText || "",
    });
    return NextResponse.json({ quote: saved });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
