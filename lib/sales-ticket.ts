/**
 * Fields required to complete a Party Perfect RENTAL PROPOSAL ticket
 * (paper form → POR Quote). Used by Mike to interview + fill tickets.
 */

export type TicketFulfillment = "customer_pickup" | "delivery";

export interface SalesTicketLine {
  qty: number;
  size?: string;
  color?: string;
  description: string;
  /** POR item name / rate when matched from catalog */
  porItemName?: string;
  unitRate?: number;
  lineNote?: string;
}

export interface SalesTicketDraft {
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
  fulfillment?: TicketFulfillment;
  venueName?: string;
  venueAddress?: string;
  venueContactName?: string;
  venueContactPhone?: string;
  guestCount?: number;
  theme?: string;
  colors?: string;
  jobType?: string;
  deliveryWindow?: string;
  pickupWindow?: string;
  specialInstructions?: string;
  salesRep?: string;
  lines: SalesTicketLine[];
  serviceLines: SalesTicketLine[];
  missingFields: string[];
}

const REQUIRED_CORE: Array<{ key: keyof SalesTicketDraft; label: string }> = [
  { key: "eventDate", label: "event date" },
  { key: "eventStartTime", label: "event start time" },
  { key: "customerName", label: "customer name" },
  { key: "customerPhone", label: "customer phone" },
  { key: "customerEmail", label: "customer email" },
  { key: "fulfillment", label: "pickup vs delivery" },
  { key: "venueName", label: "venue / location" },
  { key: "guestCount", label: "guest count" },
];

export function listMissingTicketFields(
  draft: Partial<SalesTicketDraft>,
): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_CORE) {
    const value = draft[field.key];
    if (value === undefined || value === null || value === "") {
      missing.push(field.label);
    }
  }
  if (draft.fulfillment === "delivery" && !draft.venueAddress && !draft.venueName) {
    missing.push("delivery address");
  }
  const productLines = draft.lines?.length ?? 0;
  if (productLines === 0) {
    missing.push("at least one rental line (qty + description)");
  }
  return missing;
}

/** Prompt block: how Mike completes a ticket in chat. */
export const SALES_TICKET_COMPLETION_GUIDE = `
COMPLETE A RENTAL PROPOSAL TICKET (Mike):
When Josh or showroom asks you to build/complete a ticket, interview for every missing field, then output a filled ticket they can copy into the paper form AND into POR.

Required before calling a ticket COMPLETE:
- Event date + start time (end time if known)
- Customer: name, phone, email, billing address if known
- Notes (ceremony/reception, outdoor/indoor)
- Fulfillment: CUSTOMER PICK-UP AND RETURN vs delivery
- Venue name/address + guest count
- Theme / colors / job type (wedding, dinner party, etc.)
- Line items: QTY · SIZE · COLOR · DESCRIPTION (match POR catalog names + rates when snapshot has them)
- Service lines when needed: Tulsa Delivery & Pick Up Convenience, Room Flip, Linen Bag, labor
- Delivery + pickup windows + venue contacts when delivery
- Special instructions ops needs (dance floor flip, same-night pickup fees, "earlier the better")

Output format (always use these headings):
### Rental proposal ticket
- Event / customer / venue / fulfillment / theme
- Product lines (table-style bullets)
- Service lines
- Ops notes
- Deposit reminder: full deposit when event is ~14 days out
- Missing: list anything still blank

Rules:
- Ask short follow-up questions for missing required fields — do not invent customer data.
- Prefer live POR catalog names + rates from the snapshot when suggesting SKUs.
- Suggest service lines if they chose delivery or room flip / linen.
- You cannot create the POR quote yourself (read-only) — hand a complete ticket for the showroom girl to enter.
`.trim();
