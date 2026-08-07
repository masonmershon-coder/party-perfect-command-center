import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import type { PorCatalogItem, PorCatalogState } from "@/lib/types";

/**
 * The FULL Point of Rental item catalog (all active SKUs), so Madison can match a
 * design/photo against every real rental — not just the ~300-item live snapshot sample.
 *
 * Data lives under durable key `por-catalog.json`. ENTERPRISE sync refreshes it every
 * ~10 min (with ItemFile.NUM). Manual seed: `scripts/seed-por-catalog.mjs`.
 */
const CATALOG_KEY = "por-catalog.json";
const CACHE_MS = 5 * 60 * 1000;
let cache: { state: PorCatalogState; at: number } | null = null;

function emptyCatalog(): PorCatalogState {
  return { items: [], activeItems: 0, source: "", syncedAt: "" };
}

/** Drop in-memory cache after ENTERPRISE sync writes a fresh catalog. */
export function clearPorCatalogCache() {
  cache = null;
}

export function isValidPorCatalogState(value: unknown): value is PorCatalogState {
  if (!value || typeof value !== "object") return false;
  const state = value as PorCatalogState;
  if (!Array.isArray(state.items)) return false;
  if (state.items.length === 0) return false;
  const sample = state.items[0] as Partial<PorCatalogItem>;
  return (
    typeof sample.sku === "string" &&
    typeof sample.name === "string" &&
    typeof sample.ratePerDay === "number" &&
    typeof sample.qty === "number"
  );
}

export async function savePorCatalog(state: PorCatalogState): Promise<void> {
  clearPorCatalogCache();
  await writeDurableJson(CATALOG_KEY, {
    ...state,
    activeItems: state.activeItems || state.items.length,
    syncedAt: state.syncedAt || new Date().toISOString(),
  });
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreName(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.includes(q)) return 80 + Math.min(q.length, 15);
  const qTokens = tokenize(q);
  const nTokens = new Set(tokenize(n));
  if (qTokens.length === 0) return 0;
  let hit = 0;
  for (const t of qTokens) {
    if (nTokens.has(t)) hit += 1;
    else if ([...nTokens].some((nt) => nt.includes(t) || t.includes(nt))) hit += 0.5;
  }
  return (hit / qTokens.length) * 70;
}

export async function getPorCatalog(): Promise<PorCatalogState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;
  const state = await readDurableJson<PorCatalogState>(CATALOG_KEY, emptyCatalog());
  const safe: PorCatalogState = {
    ...emptyCatalog(),
    ...state,
    items: Array.isArray(state.items) ? state.items : [],
  };
  cache = { state: safe, at: Date.now() };
  return safe;
}

export function porCatalogIsFee(item: PorCatalogItem): boolean {
  const cat = (item.category || "").toUpperCase();
  return cat.startsWith("FEE") || cat.startsWith("DISCOUNT");
}

/** Fuzzy-search the full catalog by name/category. Excludes fee/service lines by default. */
export async function searchPorCatalog(
  query: string,
  limit = 8,
  opts: { includeFees?: boolean } = {},
): Promise<Array<PorCatalogItem & { score: number }>> {
  const q = query.trim();
  if (!q) return [];
  const { items } = await getPorCatalog();
  return items
    .filter((item) => opts.includeFees || !porCatalogIsFee(item))
    .map((item) => ({
      ...item,
      score: Math.max(scoreName(q, item.name), item.category ? scoreName(q, item.category) : 0),
    }))
    .filter((row) => row.score >= 30)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Best exact-ish catalog entry for a known item name (for rate/availability lookup). */
export async function findPorCatalogItemByName(
  name: string,
  minScore = 60,
): Promise<PorCatalogItem | null> {
  const q = name.trim();
  if (!q) return null;
  const { items } = await getPorCatalog();
  let best: PorCatalogItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const s = scoreName(q, item.name);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return bestScore >= minScore ? best : null;
}
