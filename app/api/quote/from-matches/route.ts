import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import {
  formatQuoteEmail,
  formatQuoteTicket,
  type QuoteMeta,
} from "@/lib/quote-engine";
import { buildQuoteFromMatches } from "@/lib/quote-from-match";
import type { DesignMatchedItem, QuoteLineInput } from "@/lib/types";

/**
 * POST { matches: DesignMatchedItem[], quantities?: {key:number},
 *        serviceLines?: QuoteLineInput[], customerName?, eventDate?, salesRep? }
 * -> { quote, ticketText, emailDraft }
 */
export async function POST(req: Request) {
  const gate = await requireApiAuth("quoting");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await req.json()) as {
      matches?: DesignMatchedItem[];
      quantities?: Record<string, number>;
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
    const quote = buildQuoteFromMatches({
      matches: Array.isArray(body?.matches) ? body.matches : [],
      quantities: body?.quantities || {},
      serviceLines: Array.isArray(body?.serviceLines) ? body.serviceLines : [],
      meta,
    });
    return privateJson({
      quote,
      ticketText: formatQuoteTicket(quote, meta),
      emailDraft: formatQuoteEmail(quote, meta),
    });
  } catch (err) {
    return privateJson({ error: (err as Error).message }, { status: 400 });
  }
}
