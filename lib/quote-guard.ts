import { checkQuoteAvailability } from "@/lib/por-availability";
import { getPorCatalog } from "@/lib/por-catalog";

/**
 * Overbooking guard — the decision-shaped wrapper the save/approve path calls.
 *
 * Where `/api/quote/availability` returns raw per-line numbers, this answers the
 * one question the queue actually needs: "is it safe to reserve this quote on this
 * date?" It enriches each conflict with the item NAME and a plain `shortBy`, and
 * splits hard overbooks (block) from tight/soft-held lines (warn) so the owner can
 * still approve a tight one with eyes open.
 *
 * No invented data: totals come from POR catalog qty, holds from real reservations.
 */

export type GuardConflictKind = "overbooked" | "tight";

export interface GuardConflict {
  sku: string;
  name: string;
  requested: number;
  available: number;
  /** How many short (overbooked) or how close to the edge (tight). Always >= 0. */
  shortBy: number;
  total: number;
  firmHeld: number;
  softHeld: number;
  kind: GuardConflictKind;
}

export interface GuardResult {
  /** true = safe to reserve (no hard overbooks). Tight lines still allow ok=true. */
  ok: boolean;
  date: string;
  /** Hard overbooks — reserving would promise stock that isn't there. */
  conflicts: GuardConflict[];
  /** Firm-available but would eat into soft (quote) holds — approve with eyes open. */
  warnings: GuardConflict[];
  /** One-line human summary for the review queue. */
  summary: string;
}

function nameFor(catalog: Map<string, string>, sku: string): string {
  return catalog.get(sku) || sku;
}

/**
 * @param lines  quote lines, each `{ itemKey|sku, qty }`
 * @param dateISO event (delivery) date to reserve against
 */
export async function guardQuote(
  lines: Array<{ itemKey?: string; sku?: string; qty: number }>,
  dateISO: string,
): Promise<GuardResult> {
  const date = String(dateISO || "").trim();
  const normalized = (Array.isArray(lines) ? lines : []).map((l) => ({
    itemKey: String(l.itemKey ?? l.sku ?? "").trim(),
    qty: Number(l.qty) || 0,
  }));

  if (!date || normalized.length === 0) {
    return {
      ok: true,
      date,
      conflicts: [],
      warnings: [],
      summary: !date ? "No event date — availability not checked." : "No items to check.",
    };
  }

  const { items } = await getPorCatalog();
  const nameBySku = new Map(items.map((i) => [i.sku, i.name]));

  const results = await checkQuoteAvailability(normalized, date);

  const conflicts: GuardConflict[] = [];
  const warnings: GuardConflict[] = [];

  for (const r of results) {
    const base = {
      sku: r.itemKey,
      name: nameFor(nameBySku, r.itemKey),
      requested: r.requested,
      available: r.available,
      total: r.total,
      firmHeld: r.firmHeld,
      softHeld: r.softHeld,
    };
    if (r.overbooked) {
      conflicts.push({ ...base, shortBy: Math.max(0, r.requested - r.available), kind: "overbooked" });
    } else if (r.tight) {
      // Firm stock covers it, but soft (unconfirmed quote) holds overlap.
      warnings.push({ ...base, shortBy: 0, kind: "tight" });
    }
  }

  const ok = conflicts.length === 0;
  const summary = ok
    ? warnings.length === 0
      ? `All ${results.length} item(s) available on ${date}.`
      : `Available on ${date}, but ${warnings.length} item(s) overlap unconfirmed quotes.`
    : `Overbooked on ${date}: ${conflicts
        .map((c) => `${c.name} short ${c.shortBy}`)
        .join("; ")}.`;

  return { ok, date, conflicts, warnings, summary };
}

/** Lines the approve path feeds into guardQuote (SKU + qty). */
export function productLinesForGuard(
  quote: { productLines?: Array<{ porItemId?: string; qty: number }> },
) {
  return (quote.productLines || [])
    .filter((l) => l.porItemId)
    .map((l) => ({ itemKey: String(l.porItemId), qty: l.qty }));
}

/**
 * Run the overbooking guard when status is reviewed/sent.
 * Returns null for draft saves (no block).
 */
export async function guardIfApproving(input: {
  status?: string;
  quote: { productLines?: Array<{ porItemId?: string; qty: number }> };
  eventDate: string;
}): Promise<GuardResult | null> {
  if (input.status !== "reviewed" && input.status !== "sent") return null;
  return guardQuote(productLinesForGuard(input.quote), input.eventDate);
}
