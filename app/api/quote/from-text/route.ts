import { NextResponse } from "next/server";
import {
  formatQuoteEmail,
  formatQuoteTicket,
  type QuoteMeta,
} from "@/lib/quote-engine";
import { buildQuoteFromText } from "@/lib/quote-from-text";
import type { QuoteLineInput } from "@/lib/types";

/** POST { command, serviceLines?, customerName?, eventDate?, salesRep? } -> { quote, ticketText, emailDraft } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      command?: string;
      serviceLines?: QuoteLineInput[];
      customerName?: string;
      eventDate?: string;
      salesRep?: string;
    };
    const meta: QuoteMeta = {
      customerName: body?.customerName,
      eventDate: body?.eventDate,
      salesRep: body?.salesRep,
    };
    const quote = await buildQuoteFromText({
      command: String(body?.command || ""),
      serviceLines: Array.isArray(body?.serviceLines) ? body.serviceLines : [],
      meta,
    });
    return NextResponse.json({
      quote,
      ticketText: formatQuoteTicket(quote, meta),
      emailDraft: formatQuoteEmail(quote, meta),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
