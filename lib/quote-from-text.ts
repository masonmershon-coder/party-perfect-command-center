import { searchPorCatalog } from "@/lib/por-catalog";
import { buildQuote, type QuoteMeta } from "@/lib/quote-engine";
import type { Quote, QuoteLineInput } from "@/lib/types";

/**
 * Voice/text → quote. A girl types or dictates what's on the table
 * ("120 gold chargers, 130 forks, 12 round tables") and we parse the
 * quantities, match each to the real POR catalog, and price it.
 */

const WORD_NUMS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  dozen: 12,
};

const QTY_WORD =
  "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen)";

function parseQtyToken(num: string): number {
  const lower = num.toLowerCase();
  if (/^\d+$/.test(lower)) return parseInt(lower, 10);
  return WORD_NUMS[lower] ?? 0;
}

function cleanTerm(raw: string): string {
  return raw
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull { qty, term } pairs out of free text. Never silently drops a chunk. */
export function parseQuantityMentions(
  text: string,
): Array<{ qty: number; term: string; qtyNeeded?: boolean }> {
  const chunks = (text || "").split(/[,;\n]|\band\b/i);
  const out: Array<{ qty: number; term: string; qtyNeeded?: boolean }> = [];

  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;

    // qty before noun: "120 gold chargers", "a tent", "dozen napkins"
    let m = chunk.match(
      new RegExp(
        `^${QTY_WORD}\\s*x?\\s+([a-zA-Z][a-zA-Z0-9\\s\\-/'"]*)$`,
        "i",
      ),
    );
    if (m) {
      const qty = parseQtyToken(m[1]);
      const term = cleanTerm(m[2]);
      if (qty > 0 && term.length >= 2) {
        out.push({ qty, term });
        continue;
      }
    }

    // qty after noun: "chargers x120", "tables 12", "forks x 130"
    m = chunk.match(
      new RegExp(
        `^([a-zA-Z][a-zA-Z0-9\\s\\-/'"]+?)\\s*(?:x\\s*)?${QTY_WORD}$`,
        "i",
      ),
    );
    if (m) {
      const term = cleanTerm(m[1]);
      const qty = parseQtyToken(m[2]);
      if (qty > 0 && term.length >= 2) {
        out.push({ qty, term });
        continue;
      }
    }

    // qty anywhere + remainder: "12 round tables (60in)"
    m = chunk.match(
      new RegExp(`${QTY_WORD}\\s*x?\\s+(.+)$`, "i"),
    );
    if (m) {
      const qty = parseQtyToken(m[1]);
      const term = cleanTerm(m[2]);
      if (qty > 0 && term.length >= 2) {
        out.push({ qty, term });
        continue;
      }
    }

    // No qty found — keep the phrase at qty 1 so showroom can fill count.
    const term = cleanTerm(chunk);
    if (term.length >= 2) {
      out.push({ qty: 1, term, qtyNeeded: true });
    }
  }

  return out;
}

const AUTO_PRICE_MIN_SCORE = 45;

/** Match each mention to the catalog → priced quote lines (unmatched left at $0 for the girl to fill). */
export async function quoteLinesFromText(
  text: string,
): Promise<QuoteLineInput[]> {
  const mentions = parseQuantityMentions(text);
  const lines: QuoteLineInput[] = [];
  for (const { qty, term, qtyNeeded } of mentions) {
    const hits = await searchPorCatalog(term, 3);
    const hit = hits[0] && hits[0].score >= AUTO_PRICE_MIN_SCORE ? hits[0] : null;
    if (hit) {
      lines.push({
        qty,
        description: hit.name,
        unitRate: hit.ratePerDay,
        porItemName: hit.name,
        porItemId: hit.sku,
        category: hit.category,
        kind: "product",
        ...(qtyNeeded ? { lineNote: "qty assumed 1 — confirm count" } : {}),
      });
    } else {
      lines.push({
        qty,
        description: term,
        unitRate: 0,
        kind: "product",
        ...(qtyNeeded ? { lineNote: "qty needed" } : {}),
      });
    }
  }
  return lines;
}

/** One call: free text (+ optional service lines) → full quote. */
export async function buildQuoteFromText(input: {
  command: string;
  serviceLines?: QuoteLineInput[];
  meta?: QuoteMeta;
  rentalMinimum?: number;
}): Promise<Quote> {
  return buildQuote({
    productLines: await quoteLinesFromText(input.command),
    serviceLines: input.serviceLines,
    rentalMinimum: input.rentalMinimum,
  });
}
