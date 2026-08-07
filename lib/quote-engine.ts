import type { Quote, QuoteLine, QuoteLineInput, QuoteTotals } from "@/lib/types";

/**
 * Quote-assembly engine for Party Perfect. Turns matched rental lines + service
 * lines into a full quote (subtotal, tax, damage waiver, total, 50% deposit) plus
 * a printable POR-ready ticket and a client email draft.
 *
 * Money math mirrors the paper Rental Proposal form the girls use today:
 *   SUBTOTAL → +8.517% sales tax → +5% damage waiver → TOTAL → 50% deposit.
 * CONFIRM against a real POR quote PDF (Contracts-PDF) before go-live.
 */

export const SALES_TAX_RATE = 0.08517; // Tulsa combined rate
export const DAMAGE_WAIVER_RATE = 0.05; // 5% (always applied; rare negotiated exceptions)
export const DEPOSIT_RATE = 0.5; // 50% to reserve; balance due 11 days before delivery

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const PACK_OF_TEN = [
  /plate/,
  /charger/,
  /napkin/,
  /\bfork/,
  /\bknife|knives/,
  /\bspoon/,
  /flatware|silverware/,
];

function isPackOfTen(description: string): boolean {
  const d = description.toLowerCase();
  return PACK_OF_TEN.some((re) => re.test(d));
}

/** Round plates/chargers/napkins/flatware UP to the next pack of 10. */
function roundQty(qty: number, description: string): { qty: number; note?: string } {
  if (qty > 0 && isPackOfTen(description)) {
    const rounded = Math.ceil(qty / 10) * 10;
    if (rounded !== qty) {
      return { qty: rounded, note: `rounded ${qty}->${rounded} (packs of 10)` };
    }
  }
  return { qty };
}

export function buildQuote(input: {
  productLines: QuoteLineInput[];
  serviceLines?: QuoteLineInput[];
  /** default true — apply pack-of-10 rounding to product qty */
  applyRounding?: boolean;
}): Quote {
  const notes: string[] = [];

  const productLines: QuoteLine[] = (input.productLines || []).map((l) => {
    let qty = Math.max(0, Math.round(l.qty || 0));
    let lineNote: string | undefined;
    if (input.applyRounding !== false) {
      const r = roundQty(qty, l.description);
      qty = r.qty;
      lineNote = r.note;
    }
    const unitRate = Math.max(0, l.unitRate || 0);
    return {
      ...l,
      kind: "product" as const,
      qty,
      unitRate,
      lineTotal: round2(qty * unitRate),
      lineNote,
    };
  });

  const serviceLines: QuoteLine[] = (input.serviceLines || []).map((l) => {
    const qty = Math.max(0, l.qty || 1);
    const unitRate = Math.max(0, l.unitRate || 0);
    return {
      ...l,
      kind: "service" as const,
      qty,
      unitRate,
      lineTotal: round2(qty * unitRate),
    };
  });

  const productSubtotal = round2(
    productLines.reduce((s, l) => s + l.lineTotal, 0),
  );
  const serviceSubtotal = round2(
    serviceLines.reduce((s, l) => s + l.lineTotal, 0),
  );
  const subtotal = round2(productSubtotal + serviceSubtotal);
  const salesTax = round2(subtotal * SALES_TAX_RATE);
  const damageWaiver = round2(subtotal * DAMAGE_WAIVER_RATE);
  const total = round2(subtotal + salesTax + damageWaiver);
  const deposit = round2(total * DEPOSIT_RATE);

  if (
    productLines.some((l) =>
      /glass|goblet|flute|wine|tumbler|stemware|rocks/i.test(l.description),
    )
  ) {
    notes.push(
      "Glassware present — round to full racks (16 or 25) in POR; rack size not auto-applied.",
    );
  }
  if (productSubtotal === 0) {
    notes.push("No rental product lines yet — add items before sending.");
  }

  const totals: QuoteTotals = {
    productSubtotal,
    serviceSubtotal,
    subtotal,
    salesTax,
    damageWaiver,
    total,
    deposit,
  };

  return { productLines, serviceLines, totals, notes };
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export interface QuoteMeta {
  customerName?: string;
  eventDate?: string;
  salesRep?: string;
}

/** Plain-text POR-ready ticket for the showroom to review / key in. */
export function formatQuoteTicket(quote: Quote, meta: QuoteMeta = {}): string {
  const out: string[] = ["RENTAL PROPOSAL — Party Perfect Event Rentals"];
  if (meta.customerName) out.push(`Customer: ${meta.customerName}`);
  if (meta.eventDate) out.push(`Event date: ${meta.eventDate}`);
  out.push("");
  for (const l of quote.productLines) {
    out.push(
      `${String(l.qty).padStart(4)} x ${(l.porItemName || l.description)}  @ ${money(l.unitRate)} = ${money(l.lineTotal)}`,
    );
    if (l.lineNote) out.push(`        (${l.lineNote})`);
  }
  if (quote.serviceLines.length) {
    out.push("-- Services --");
    for (const l of quote.serviceLines) {
      out.push(`     ${l.description} = ${money(l.lineTotal)}`);
    }
  }
  out.push("");
  out.push(`Subtotal:           ${money(quote.totals.subtotal)}`);
  out.push(`Sales tax (8.517%): ${money(quote.totals.salesTax)}`);
  out.push(`Damage waiver (5%): ${money(quote.totals.damageWaiver)}`);
  out.push(`TOTAL:              ${money(quote.totals.total)}`);
  out.push(
    `Deposit (50%):      ${money(quote.totals.deposit)}  (reserves the date; balance due 11 days before delivery)`,
  );
  for (const n of quote.notes) out.push(`Note: ${n}`);
  return out.join("\n");
}

/** On-brand client email draft. */
export function formatQuoteEmail(quote: Quote, meta: QuoteMeta = {}): string {
  const name = meta.customerName || "there";
  const forEvent = meta.eventDate ? ` for your ${meta.eventDate} event` : "";
  return [
    `Hi ${name},`,
    "",
    `Thank you for considering Party Perfect Event Rentals${forEvent}! Here's your quote:`,
    "",
    ...quote.productLines.map(
      (l) => `  • ${l.qty} × ${l.porItemName || l.description} — ${money(l.lineTotal)}`,
    ),
    ...quote.serviceLines.map((l) => `  • ${l.description} — ${money(l.lineTotal)}`),
    "",
    `Subtotal: ${money(quote.totals.subtotal)}`,
    `Sales tax (8.517%): ${money(quote.totals.salesTax)}`,
    `Damage waiver (5%): ${money(quote.totals.damageWaiver)}`,
    `Total: ${money(quote.totals.total)}`,
    "",
    `A 50% deposit of ${money(quote.totals.deposit)} reserves your date and items; the remaining 50% is due 11 days before delivery. You can pay by card, cash, or check.`,
    "",
    "Reply to confirm and we'll lock it in!",
    "",
    "Warmly,",
    `${meta.salesRep || "Party Perfect Event Rentals"}`,
    "918-258-7368 · partyperfecteventrental.com",
  ].join("\n");
}
