/**
 * Parse web-quote / PR hosting notification emails into ticket draft fields.
 * Best-effort text extraction — showroom still confirms in POR.
 */

import type { SalesTicketDraft, SalesTicketLine } from "./sales-ticket";
import { listMissingTicketFields } from "./sales-ticket";

export function isPrHostingWebQuoteEmail(input: {
  subject?: string;
  sender?: string;
  senderEmail?: string;
  body?: string;
}): boolean {
  const blob = [
    input.subject,
    input.sender,
    input.senderEmail,
    input.body,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return (
    blob.includes("prhosting") ||
    blob.includes("pr hosting") ||
    blob.includes("hosting.net") ||
    blob.includes("do not reply") ||
    blob.includes("donotreply") ||
    blob.includes("do-not-reply") ||
    blob.includes("point of rental") ||
    (blob.includes("web") && blob.includes("quote"))
  );
}

function pick(patterns: RegExp[], text: string): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

function parseLines(body: string): SalesTicketLine[] {
  const lines: SalesTicketLine[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    // e.g. "125 x Marie Fern Charger" or "Qty: 125 Description: ..."
    let m = line.match(/^(\d+)\s*[x×]\s+(.+)$/i);
    if (m) {
      lines.push({ qty: Number(m[1]), description: m[2].trim() });
      continue;
    }
    m = line.match(/^qty[:\s]+(\d+)[,;\s]+(?:size[:\s]+([^,;]+)[,;\s]+)?(?:color[:\s]+([^,;]+)[,;\s]+)?(?:desc(?:ription)?[:\s]+)?(.+)$/i);
    if (m) {
      lines.push({
        qty: Number(m[1]),
        size: m[2]?.trim() || undefined,
        color: m[3]?.trim() || undefined,
        description: m[4].trim(),
      });
    }
  }
  return lines;
}

/** Round plate/charger/flatware/napkin qtys up to packs of 10. */
export function roundPackOfTen(qty: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.ceil(qty / 10) * 10;
}

export function roundRack(qty: number, rackSize: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (!Number.isFinite(rackSize) || rackSize <= 0) return qty;
  return Math.ceil(qty / rackSize) * rackSize;
}

export function detectPackCategory(description: string): "pack10" | "glassware" | "other" {
  const d = description.toLowerCase();
  if (
    /\b(plate|charger|napkin|fork|knife|spoon|flatware|silverware|teaspoon|tablespoon)\b/.test(d)
  ) {
    return "pack10";
  }
  if (/\b(glass|goblet|flute|wine|tumbler|rack)\b/.test(d)) {
    return "glassware";
  }
  return "other";
}

export function applyPackRoundingToLines(lines: SalesTicketLine[]): SalesTicketLine[] {
  return lines.map((line) => {
    const kind = detectPackCategory(line.description);
    if (kind === "pack10") {
      const rounded = roundPackOfTen(line.qty);
      if (rounded === line.qty) return line;
      return {
        ...line,
        qty: rounded,
        lineNote: [line.lineNote, `rounded up to pack of 10 (was ${line.qty})`]
          .filter(Boolean)
          .join("; "),
      };
    }
    if (kind === "glassware") {
      const rackMatch = line.description.match(/rack(?:s)?\s*(?:of\s*)?(\d+)/i);
      const rackSize = rackMatch ? Number(rackMatch[1]) : undefined;
      if (rackSize) {
        const rounded = roundRack(line.qty, rackSize);
        if (rounded !== line.qty) {
          return {
            ...line,
            qty: rounded,
            lineNote: [
              line.lineNote,
              `rounded up to rack of ${rackSize} (was ${line.qty})`,
            ]
              .filter(Boolean)
              .join("; "),
          };
        }
      } else {
        return {
          ...line,
          lineNote: [
            line.lineNote,
            "glassware — confirm rack size (16 or 25 typical) in POR",
          ]
            .filter(Boolean)
            .join("; "),
        };
      }
    }
    return line;
  });
}

export function draftTicketFromWebQuoteEmail(input: {
  subject?: string;
  sender?: string;
  senderEmail?: string;
  body?: string;
}): SalesTicketDraft {
  const body = input.body || "";
  const text = `${input.subject || ""}\n${body}`;

  const customerName =
    pick(
      [
        /(?:customer|client|name)\s*[:\-]\s*(.+)$/im,
        /(?:for|regarding)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
        /\b(Tiffany\s+Obene)\b/i,
        /\b(Tiffinay\s+Obene)\b/i,
      ],
      text,
    ) ||
    (/\btiffany\b/i.test(text) ? "Tiffany Obene" : undefined);

  const draft: SalesTicketDraft = {
    customerName,
    customerEmail: pick(
      [/e-?mail\s*[:\-]\s*(\S+@\S+)/i, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i],
      text,
    ),
    customerPhone: pick(
      [/(?:phone|tel|mobile)\s*[:\-]\s*([\d().\-\s]{10,})/i, /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/],
      text,
    ),
    eventDate: pick(
      [/(?:event\s*date|date)\s*[:\-]\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i],
      text,
    ),
    eventStartTime: pick([/(?:start\s*time|event\s*time)\s*[:\-]\s*([0-9: ]+[ap]m)/i], text),
    venueName: pick(
      [/(?:venue|location|delivery\s*address)\s*[:\-]\s*(.+)$/im],
      text,
    ),
    guestCount: (() => {
      const g = pick([/(?:guest\s*count|guests)\s*[:\-]\s*(\d+)/i, /(\d+)\s+guests?/i], text);
      return g ? Number(g) : undefined;
    })(),
    fulfillment: /pick[\s-]?up/i.test(text)
      ? "customer_pickup"
      : /deliver/i.test(text)
        ? "delivery"
        : undefined,
    theme: pick([/(?:theme)\s*[:\-]\s*(.+)$/im], text),
    colors: pick([/(?:colors?)\s*[:\-]\s*(.+)$/im], text),
    specialInstructions: [
      "Source: PR / web hosting quote email — do not reply to do-not-reply.",
      "Import into POR from the web quote link, then finish ticket fields.",
    ].join(" "),
    lines: applyPackRoundingToLines(parseLines(body)),
    serviceLines: [],
    missingFields: [],
  };

  draft.missingFields = listMissingTicketFields(draft);
  return draft;
}

export function formatTicketDraftForMike(draft: SalesTicketDraft): string {
  const lines = [
    "### Rental proposal ticket (from web/email)",
    `- Customer: ${draft.customerName || "MISSING"}`,
    `- Phone: ${draft.customerPhone || "MISSING"}`,
    `- Email: ${draft.customerEmail || "MISSING"}`,
    `- Event date: ${draft.eventDate || "MISSING"} ${draft.eventStartTime || ""}`.trim(),
    `- Venue: ${draft.venueName || "MISSING"}`,
    `- Guests: ${draft.guestCount ?? "MISSING"}`,
    `- Fulfillment: ${draft.fulfillment || "MISSING"}`,
    `- Theme/colors: ${[draft.theme, draft.colors].filter(Boolean).join(" / ") || "n/a"}`,
    "",
    "Product lines:",
    ...(draft.lines.length
      ? draft.lines.map(
          (l) =>
            `- ${l.qty}${l.size ? ` · ${l.size}` : ""}${l.color ? ` · ${l.color}` : ""} · ${l.description}${l.lineNote ? ` (${l.lineNote})` : ""}`,
        )
      : ["- (none parsed — pull from web quote / ask showroom)"]),
    "",
    "Service lines:",
    ...(draft.serviceLines.length
      ? draft.serviceLines.map((l) => `- ${l.qty} · ${l.description}`)
      : ["- (add delivery / room flip / linen bag if needed)"]),
    "",
    `- Ops notes: ${draft.specialInstructions || ""}`,
    "- Deposit: full deposit when event is ~14 days out",
    `- Check: rental merchandise subtotal must meet shop MINIMUM IN RENTALS (exclude fees/tax)`,
    `- Missing: ${draft.missingFields.length ? draft.missingFields.join(", ") : "none — ready for POR entry"}`,
  ];
  return lines.join("\n");
}
