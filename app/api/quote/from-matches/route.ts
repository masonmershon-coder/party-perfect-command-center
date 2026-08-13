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
import { resolveTaxCode } from "@/lib/por-tax";
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
      taxCode?: string;
      taxExemptNumber?: string;
      applyDamageWaiver?: boolean;
      damageWaiverExempt?: boolean;
      deliveryDateTime?: string;
      pickupDateTime?: string;
      transactionNotes?: string;
      deliveryNotes?: string;
      pickupNotes?: string;
    };
    const taxRow = await resolveTaxCode(body?.taxCode);
    const meta: QuoteMeta = {
      customerName: body?.customerName,
      eventDate: body?.eventDate,
      salesRep: body?.salesRep,
      taxCode: taxRow?.code || body?.taxCode,
      deliveryDateTime: body?.deliveryDateTime,
      pickupDateTime: body?.pickupDateTime,
      transactionNotes: body?.transactionNotes,
      deliveryNotes: body?.deliveryNotes,
      pickupNotes: body?.pickupNotes,
    };
    const quote = buildQuoteFromMatches({
      matches: Array.isArray(body?.matches) ? body.matches : [],
      quantities: body?.quantities || {},
      serviceLines: Array.isArray(body?.serviceLines) ? body.serviceLines : [],
      meta,
      taxCode: body?.taxCode,
      taxRow,
      taxExemptNumber: body?.taxExemptNumber,
      applyDamageWaiver: body?.applyDamageWaiver,
      damageWaiverExempt: body?.damageWaiverExempt,
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
