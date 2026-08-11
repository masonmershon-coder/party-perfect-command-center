/**
 * Name-based inventory lookup for the AI agents (Mike/Madison) and the UI.
 *
 * Answers plain-English questions like "how many 8 Flip tables are out right now?"
 * or "how many gold chargers are available on Oct 12?" — by searching the catalog
 * by NAME/color/type, resolving the SKU, then reading live counts.
 *
 * Bridges what already exists:
 *   searchPorCatalog(name)  → resolve name → item (sku/num/qty)
 *   availableOn(sku, date)  → { total, firmHeld (out), softHeld, available }
 *
 * Defaults the date to TODAY, so "right now" works without the caller supplying a date
 * (this was the gap: the old por_availability tool required a SKU *and* a date).
 */
import { searchPorCatalog } from "@/lib/por-catalog";
import { availableOn } from "@/lib/por-availability";
import { clampQty } from "@/lib/por-rentable";

export type InventoryMatch = {
  name: string;
  sku: string;
  category: string | null;
  total: number; // total owned
  outNow: number; // firm-held on the date (on rent)
  softHeld: number; // soft/quote holds
  available: number; // total - firm held
  date: string; // the date these counts are for (YYYY-MM-DD)
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Look up inventory by item name/description. Returns the top matches with live
 * total / out-now / available counts for the given date (default: today).
 */
export async function lookupInventory(
  query: string,
  dateISO?: string,
  limit = 5,
): Promise<InventoryMatch[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const date = dateISO && dateISO.trim() ? dateISO.trim() : todayISO();

  const matches = await searchPorCatalog(q, limit);
  const results: InventoryMatch[] = [];
  for (const m of matches) {
    const a = await availableOn(m.sku, date);
    results.push({
      name: m.name,
      sku: m.sku,
      category: m.category ?? m.categoryCode ?? null,
      total: clampQty(a.total),
      outNow: clampQty(a.firmHeld),
      softHeld: clampQty(a.softHeld),
      available: clampQty(a.available),
      date,
    });
  }
  return results;
}
