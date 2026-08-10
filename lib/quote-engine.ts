import { roundRack } from "@/lib/sales-web-quote";
import type { Quote, QuoteLine, QuoteLineInput, QuoteTotals } from "@/lib/types";

/**
 * Quote-assembly engine for Party Perfect. Turns matched rental lines + service
 * lines into a full quote (subtotal, tax, damage waiver, total, 50% deposit) plus
 * a printable POR-ready ticket and a client email draft.
 *
 * Money math mirrors the paper Rental Proposal form the girls use today:
 *   SUBTOTAL → +8.517% sales tax → +5% damage waiver → TOTAL → 50% deposit.
 * CONFIRM against a real POR quote PDF (Contracts-PDF) before go-live.
 *
 * Damage waiver is on product (rental) subtotal only — not delivery/service.
 * Tax base still includes services until a real POR PDF confirms otherwise.
 */

export const SALES_TAX_RATE = 0.08517; // Tulsa combined rate
export const DAMAGE_WAIVER_RATE = 0.05; // 5% (always applied; rare negotiated exceptions)
export const DEPOSIT_RATE = 0.5; // 50% to reserve; balance due 11 days before delivery

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const PACK_OF_TEN = [
  /\bplates?\b/,
  /\bchargers?\b/,
  /\bnapkins?\b/,
  /\bforks?\b/,
  /\bknives?\b|\bknife\b/,
  /\bspoons?\b/,
  /\bflatware\b|\bsilverware\b/,
];

function isPackOfTen(description: string): boolean {
  const d = description.toLowerCase();
  return PACK_OF_TEN.some((re) => re.test(d));
}

function isGlassware(description: string): boolean {
  return /\b(glass|goblet|flute|wine|tumbler|stemware|rocks)\b/i.test(description);
}

/** Parse rack size from POR names like "25/rack", "16/25 Compartment Glass Rack". */
export function parseRackSize(porItemName?: string, description?: string): number | null {
  const text = `${porItemName || ""} ${description || ""}`;
  const m =
    text.match(/(\d+)\s*\/\s*rack/i) ||
    text.match(/(\d+)\s*\/\s*\d+\s*compartment/i) ||
    text.match(/rack(?:s)?\s*(?:of\s*)?(\d+)/i) ||
    text.match(/(\d+)\s*per\s*rack/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Round plates/chargers/napkins/flatware UP to packs of 10; glassware to racks when known. */
function roundQty(
  qty: number,
  description: string,
  porItemName?: string,
): { qty: number; note?: string } {
  const label = `${description} ${porItemName || ""}`;
  if (qty > 0 && isPackOfTen(label)) {
    const rounded = Math.ceil(qty / 10) * 10;
    if (rounded !== qty) {
      return { qty: rounded, note: `rounded ${qty}->${rounded} (packs of 10)` };
    }
  }

  if (isGlassware(label)) {
    const rack = parseRackSize(porItemName, description);
    if (rack) {
      const rounded = roundRack(qty, rack);
      if (rounded !== qty) {
        return {
          qty: rounded,
          note: `rounded ${qty}->${rounded} (rack of ${rack})`,
        };
      }
    } else {
      return {
        qty,
        note: "Glassware — round to full racks (16 or 25) in POR; rack size not on this SKU name.",
      };
    }
  }

  return { qty };
}

export function buildQuote(input: {
  productLines: QuoteLineInput[];
  serviceLines?: QuoteLineInput[];
  /** default true — apply pack-of-10 / rack rounding to product qty */
  applyRounding?: boolean;
  /** Shop rental minimum (merchandise only). Silent if omitted. */
  rentalMinimum?: number;
}): Quote {
  const notes: string[] = [];

  const productLines: QuoteLine[] = (input.productLines || []).map((l) => {
    let qty = Math.max(0, Math.round(l.qty || 0));
    let lineNote = l.lineNote;
    if (input.applyRounding !== false) {
      const r = roundQty(qty, l.description, l.porItemName);
      qty = r.qty;
      if (r.note) {
        lineNote = [lineNote, r.note].filter(Boolean).join("; ");
      }
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
  // Tax on product+service until a real POR PDF confirms otherwise.
  const salesTax = round2(subtotal * SALES_TAX_RATE);
  // Waiver on rental merchandise only — not delivery/labor fees.
  const damageWaiver = round2(productSubtotal * DAMAGE_WAIVER_RATE);
  const total = round2(subtotal + salesTax + damageWaiver);
  const deposit = round2(total * DEPOSIT_RATE);

  const glassWithoutRack = productLines.some((l) => {
    if (!isGlassware(l.description) && !isGlassware(l.porItemName || "")) return false;
    return !parseRackSize(l.porItemName, l.description);
  });
  if (glassWithoutRack) {
    notes.push(
      "Glassware present — round to full racks (16 or 25) in POR; rack size not auto-applied on some SKUs.",
    );
  }
  if (productSubtotal === 0) {
    notes.push("No rental product lines yet — add items before sending.");
  }

  let belowRentalMinimum = false;
  const min = input.rentalMinimum;
  if (typeof min === "number" && Number.isFinite(min) && min > 0) {
    if (productSubtotal < min) {
      belowRentalMinimum = true;
      notes.push(
        `Below rental minimum: merchandise $${productSubtotal.toFixed(2)} < $${min.toFixed(2)} (fees/tax/waiver do not count).`,
      );
    }
  }

  const totals: QuoteTotals = {
    productSubtotal,
    serviceSubtotal,
    subtotal,
    salesTax,
    damageWaiver,
    total,
    deposit,
    ...(belowRentalMinimum ? { belowRentalMinimum: true } : {}),
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
