import { NextResponse } from "next/server";
import {
  buildQuote,
  formatQuoteEmail,
  formatQuoteTicket,
} from "@/lib/quote-engine";
import type { QuoteLineInput } from "@/lib/types";

/** POST { productLines, serviceLines?, customerName?, eventDate?, salesRep?, applyRounding? } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      productLines?: QuoteLineInput[];
      serviceLines?: QuoteLineInput[];
      customerName?: string;
      eventDate?: string;
      salesRep?: string;
      applyRounding?: boolean;
    };
    const quote = buildQuote({
      productLines: Array.isArray(body?.productLines) ? body.productLines : [],
      serviceLines: Array.isArray(body?.serviceLines) ? body.serviceLines : [],
      applyRounding: body?.applyRounding,
    });
    const meta = {
      customerName: body?.customerName,
      eventDate: body?.eventDate,
      salesRep: body?.salesRep,
    };
    return NextResponse.json({
      quote,
      ticketText: formatQuoteTicket(quote, meta),
      emailDraft: formatQuoteEmail(quote, meta),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
