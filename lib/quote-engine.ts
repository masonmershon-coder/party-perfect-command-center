import { roundRack } from "@/lib/sales-web-quote";
import type {
  PorTaxCodeRow,
} from "@/lib/por-tax";
import type {
  Quote,
  QuoteChargeKind,
  QuoteLine,
  QuoteLineInput,
  QuoteTotals,
} from "@/lib/types";

/**
 * Quote-assembly engine. POR is the spec:
 *   - Damage waiver = 5% of RENT subtotal only (sale/merchandise excluded).
 *   - Waiver is declinable / exempt per ticket (AskDamageWaiver / DamageWaiverExempt).
 *   - Tax follows customer TaxCode → TaxTable (TaxRent / TaxSale / TaxDW separately).
 *   - Deposit 50% is still the observed live-reservation pattern, not a new rule.
 *
 * Never invent a tax rate. Unknown / missing TaxCode → tax 0 + a note.
 */

/** @deprecated Do not use as a store-wide rate. Tax follows TaxCode. */
export const SALES_TAX_RATE = 0.08517;
export const DAMAGE_WAIVER_RATE = 0.05;
export const DEPOSIT_RATE = 0.5;

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

function resolveChargeKind(line: QuoteLineInput): QuoteChargeKind {
  if (line.chargeKind === "sale" || line.chargeKind === "rent" || line.chargeKind === "service") {
    return line.chargeKind;
  }
  if (line.kind === "service") return "service";
  return "rent";
}

export function buildQuote(input: {
  productLines: QuoteLineInput[];
  serviceLines?: QuoteLineInput[];
  /** default true — apply pack-of-10 / rack rounding to product qty */
  applyRounding?: boolean;
  /** Shop rental minimum (merchandise only). Silent if omitted. */
  rentalMinimum?: number;
  /** CustomerFile.TaxCode → TaxTable row. Required for tax; never invent. */
  taxCode?: string;
  taxRow?: PorTaxCodeRow | null;
  taxExemptNumber?: string;
  /** AskDamageWaiver — default true. */
  applyDamageWaiver?: boolean;
  /** DamageWaiverExempt */
  damageWaiverExempt?: boolean;
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
    const chargeKind = resolveChargeKind(l);
    return {
      ...l,
      kind: "product" as const,
      chargeKind,
      qty,
      unitRate,
      lineTotal: round2(qty * unitRate),
      lineNote,
      lineDesc: l.lineDesc,
    };
  });

  const serviceLines: QuoteLine[] = (input.serviceLines || []).map((l) => {
    const qty = Math.max(0, l.qty || 1);
    const unitRate = Math.max(0, l.unitRate || 0);
    return {
      ...l,
      kind: "service" as const,
      chargeKind: "service" as const,
      qty,
      unitRate,
      lineTotal: round2(qty * unitRate),
    };
  });

  const productSubtotal = round2(
    productLines.reduce((s, l) => s + l.lineTotal, 0),
  );
  const rentSubtotal = round2(
    productLines
      .filter((l) => l.chargeKind !== "sale")
      .reduce((s, l) => s + l.lineTotal, 0),
  );
  const saleSubtotal = round2(
    productLines
      .filter((l) => l.chargeKind === "sale")
      .reduce((s, l) => s + l.lineTotal, 0),
  );
  const serviceSubtotal = round2(
    serviceLines.reduce((s, l) => s + l.lineTotal, 0),
  );
  const subtotal = round2(productSubtotal + serviceSubtotal);

  const waiverOn =
    input.applyDamageWaiver !== false && input.damageWaiverExempt !== true;
  const damageWaiver = waiverOn ? round2(rentSubtotal * DAMAGE_WAIVER_RATE) : 0;
  if (waiverOn) {
    for (const line of productLines) {
      line.dmgWvr =
        line.chargeKind === "sale" ? 0 : round2(line.lineTotal * DAMAGE_WAIVER_RATE);
    }
  } else {
    for (const line of productLines) line.dmgWvr = 0;
  }

  const taxRow = input.taxRow ?? null;
  const taxExempt = Boolean(String(input.taxExemptNumber || "").trim());
  let taxRent = 0;
  let taxSale = 0;
  let taxWaiver = 0;
  if (taxExempt) {
    notes.push(
      `Tax exempt${input.taxExemptNumber ? ` (${input.taxExemptNumber})` : ""} — tax not applied.`,
    );
  } else if (taxRow) {
    taxRent = round2(rentSubtotal * taxRow.taxRent);
    taxSale = round2(saleSubtotal * taxRow.taxSale);
    taxWaiver = taxRow.taxDw > 0 ? round2(damageWaiver * taxRow.taxDw) : 0;
  } else if (input.taxCode) {
    notes.push(
      `TaxCode ${input.taxCode} is not in TaxTable — tax not invented. Select a known POR tax code.`,
    );
  } else {
    notes.push("No customer TaxCode — tax not applied until the customer is selected.");
  }
  const salesTax = round2(taxRent + taxSale + taxWaiver);
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
    rentSubtotal,
    saleSubtotal,
    subtotal,
    salesTax,
    taxRent,
    taxSale,
    taxWaiver,
    taxCode: taxRow?.code || input.taxCode,
    damageWaiver,
    waiverApplied: waiverOn && damageWaiver > 0,
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
  taxCode?: string;
  deliveryDateTime?: string;
  pickupDateTime?: string;
  transactionNotes?: string;
  deliveryNotes?: string;
  pickupNotes?: string;
}

/** Plain-text POR-ready ticket for the showroom to review / key in. */
export function formatQuoteTicket(quote: Quote, meta: QuoteMeta = {}): string {
  const out: string[] = ["RENTAL PROPOSAL — Party Perfect Event Rentals"];
  if (meta.customerName) out.push(`Customer: ${meta.customerName}`);
  if (meta.eventDate) out.push(`Event date: ${meta.eventDate}`);
  if (meta.deliveryDateTime) out.push(`DeliveryDate: ${meta.deliveryDateTime}`);
  if (meta.pickupDateTime) out.push(`PickupDate: ${meta.pickupDateTime}`);
  if (meta.salesRep) out.push(`Salesman: ${meta.salesRep}`);
  if (meta.taxCode) out.push(`TaxCode: ${meta.taxCode}`);
  out.push("");
  for (const l of quote.productLines) {
    out.push(
      `${String(l.qty).padStart(4)} x ${(l.porItemName || l.description)}  @ ${money(l.unitRate)} = ${money(l.lineTotal)}`,
    );
    if (l.lineDesc) out.push(`        Desc: ${l.lineDesc}`);
    if (l.lineNote) out.push(`        Comments: ${l.lineNote}`);
    if (l.chargeKind === "sale") out.push(`        (SALE — excluded from damage waiver)`);
    if (l.dmgWvr) out.push(`        DmgWvr: ${money(l.dmgWvr)}`);
  }
  if (quote.serviceLines.length) {
    out.push("-- Services --");
    for (const l of quote.serviceLines) {
      out.push(`     ${l.description} = ${money(l.lineTotal)}`);
    }
  }
  out.push("");
  if (meta.transactionNotes) out.push(`Notes: ${meta.transactionNotes}`);
  if (meta.deliveryNotes) out.push(`DeliveryNotes: ${meta.deliveryNotes}`);
  if (meta.pickupNotes) out.push(`PickupNotes: ${meta.pickupNotes}`);
  out.push(`RENT subtotal:      ${money(quote.totals.rentSubtotal)}`);
  if (quote.totals.saleSubtotal > 0) {
    out.push(`SALE subtotal:      ${money(quote.totals.saleSubtotal)}`);
  }
  out.push(`Subtotal:           ${money(quote.totals.subtotal)}`);
  out.push(
    `Sales tax${quote.totals.taxCode ? ` (TaxCode ${quote.totals.taxCode})` : ""}: ${money(quote.totals.salesTax)}`,
  );
  out.push(
    `Damage waiver (5% of RENT${quote.totals.waiverApplied ? "" : ", not applied"}): ${money(quote.totals.damageWaiver)}`,
  );
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
    `Sales tax: ${money(quote.totals.salesTax)}`,
    `Damage waiver (5% of rentals): ${money(quote.totals.damageWaiver)}`,
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
