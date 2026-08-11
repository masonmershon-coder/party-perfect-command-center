/**
 * Rentable vs fee/labor/service classification for Point of Rental stock math.
 *
 * POR ItemFile.Category is a **numeric code** (string), not a label. Fee/labor
 * lines live mainly in codes 34 (setup/breakdown/labor) and 19 (delivery /
 * convenience). Counting those as "items out" inflated dashboards ~10–20×.
 *
 * Never invent quantities — classifiers only decide inclusion; numbers come
 * from the synced snapshot / catalog.
 */

/** Category codes that are fee/labor/delivery/service — never rentable stock. */
export const POR_FEE_CATEGORY_CODES = new Set([
  "19", // DELIVERY / Convenience fees
  "34", // Setup / Breakdown / LABOR fees
]);

/**
 * ItemName patterns for non-rentable fee/labor/service lines that sometimes
 * live in mixed merchandise categories (15, 20, 30, 41, …).
 */
export const POR_FEE_NAME_RE =
  /^(setup|breakdown|installation|removal|repack|delivery|pick ?up|convenience|service|processing|wash & press|after hours|vendor transport|cleaning fee)|(.*\bfee\b)|(.*\$\d+\s*min)/i;

export type PorRentableInput = {
  /** Category code or label (snapshot uses code as `name`/`category`). */
  category?: string | null;
  categoryCode?: string | null;
  name?: string | null;
  /** When true, exclude from all stock math (and usually from default lists). */
  inactive?: boolean | null;
};

export function normalizePorCategoryCode(
  category: string | null | undefined,
): string {
  return String(category ?? "")
    .trim()
    .toUpperCase();
}

/** True when category string is a known fee/labor code or FEE… / DISCOUNT… label. */
export function isFeeCategoryCode(
  category: string | null | undefined,
): boolean {
  const c = normalizePorCategoryCode(category);
  if (!c) return false;
  if (POR_FEE_CATEGORY_CODES.has(c)) return true;
  // Legacy/alternate POR installs that store "FEE - …" labels
  if (c.startsWith("FEE") || c.startsWith("DISCOUNT")) return true;
  return false;
}

export function isFeeItemName(name: string | null | undefined): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  return POR_FEE_NAME_RE.test(n);
}

/**
 * Rentable stock line — used for EVERY inventory rollup (dashboard, agent,
 * inventory list default). Fees remain viewable under Fees & Services only.
 */
export function isRentable(item: PorRentableInput): boolean {
  if (item.inactive === true) return false;
  const code = item.categoryCode ?? item.category;
  if (isFeeCategoryCode(code)) return false;
  if (isFeeItemName(item.name)) return false;
  return true;
}

/** Clamp a quantity for display — never render negatives. */
export function clampQty(n: number | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, v);
}

export type PorReconciliationRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
  reason: "negative_quantity" | "negative_available";
};

export function collectNegativeQtyRows(
  rows: Array<{
    id?: string;
    name?: string;
    category?: string;
    quantity?: number;
    available?: number;
  }>,
): PorReconciliationRow[] {
  const out: PorReconciliationRow[] = [];
  for (const row of rows) {
    const quantity = Number(row.quantity);
    const available = Number(row.available);
    if (Number.isFinite(quantity) && quantity < 0) {
      out.push({
        id: String(row.id || row.name || "unknown"),
        name: String(row.name || "unknown"),
        category: String(row.category || ""),
        quantity,
        available: Number.isFinite(available) ? available : 0,
        reason: "negative_quantity",
      });
    } else if (Number.isFinite(available) && available < 0) {
      out.push({
        id: String(row.id || row.name || "unknown"),
        name: String(row.name || "unknown"),
        category: String(row.category || ""),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        available,
        reason: "negative_available",
      });
    }
  }
  return out;
}
