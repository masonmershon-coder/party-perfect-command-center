import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import { isRentable } from "@/lib/por-rentable";
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

/** Categories that are structure/hardware — usually wrong for tabletop/linen queries. */
const HARDWARE_CATS =
  /tent\s*structure|draping[\s-]*hardware|pipe\s*&?\s*drape|hardware/i;

/** Bidirectional domain synonyms / abbreviations for Party Perfect catalog language. */
const SYNONYM_GROUPS: string[][] = [
  ["round", "rd"],
  ["square", "sq"],
  ["rectangle", "rect", "rectangular"],
  ["fork", "forks", "flatware", "silverware"],
  ["knife", "knives", "flatware", "silverware"],
  ["spoon", "spoons", "flatware", "silverware"],
  ["charger", "chargers"],
  ["napkin", "napkins", "linen", "linens"],
  ["tablecloth", "tablecloths", "cloth", "linen", "linens"],
  ["glass", "goblet", "flute", "stemware", "glassware", "tumbler"],
  ["table", "tables"],
  ["chair", "chairs"],
];

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

/** Stem trailing plural s/es for matching (forks→fork, glasses→glass). */
export function stemToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length <= 3) return t;
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ses") || t.endsWith("xes") || t.endsWith("zes")) return t.slice(0, -2);
  if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map(stemToken);
}

function expandSynonyms(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const group of SYNONYM_GROUPS) {
      const stemmedGroup = group.map(stemToken);
      if (stemmedGroup.includes(t) || group.includes(t)) {
        for (const g of stemmedGroup) out.add(g);
      }
    }
  }
  return out;
}

/** True when the query looks like tabletop / linen / glassware (not tent hardware). */
function isTabletopQuery(query: string): boolean {
  return /\b(table|tables|chair|fork|knife|spoon|flatware|charger|napkin|linen|cloth|glass|goblet|flute|plate|placemat|bowl)\b/i.test(
    query,
  );
}

/**
 * Name similarity for catalog search.
 * - Exact / contains strong hits
 * - Stemmed whole-token matches (plurals)
 * - Prefix match only when both sides length >= 4 (avoids "for"↔"forks")
 * - Domain synonyms (round↔rd, forks↔flatware, …)
 */
export function scoreName(query: string, name: string): number {
  const qRaw = query.trim().toLowerCase();
  const nRaw = name.toLowerCase();
  if (!qRaw || !nRaw) return 0;
  if (nRaw === qRaw) return 100;
  if (nRaw.includes(qRaw) && qRaw.length >= 4) return 80 + Math.min(qRaw.length, 15);

  const qTokens = tokenize(qRaw);
  const nTokens = tokenize(nRaw);
  if (qTokens.length === 0 || nTokens.length === 0) return 0;

  const nSet = new Set(nTokens);
  const nExpanded = expandSynonyms(nTokens);
  const qExpanded = expandSynonyms(qTokens);

  let hit = 0;
  for (const t of qExpanded) {
    if (nSet.has(t) || nExpanded.has(t)) {
      hit += 1;
      continue;
    }
    // Prefix/substring only for meaningful tokens (>=4 chars) — not stopword fragments.
    if (t.length >= 4) {
      const soft = [...nExpanded].some(
        (nt) =>
          nt.length >= 4 && (nt.startsWith(t) || t.startsWith(nt)),
      );
      if (soft) hit += 0.35;
    }
  }

  // Prefer denser whole-token overlap from original query tokens.
  let exactTokenHits = 0;
  for (const t of qTokens) {
    if (nSet.has(t) || nExpanded.has(t)) exactTokenHits += 1;
  }
  const base = (hit / Math.max(qExpanded.size, 1)) * 70;
  const exactBoost = (exactTokenHits / qTokens.length) * 25;
  return Math.min(100, base + exactBoost);
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
  return !isRentable({
    category: item.categoryCode || item.category,
    categoryCode: item.categoryCode,
    name: item.name,
  });
}

function isHardwareNoise(item: PorCatalogItem): boolean {
  return HARDWARE_CATS.test(item.category || "") || HARDWARE_CATS.test(item.name || "");
}

/** Fuzzy-search the full catalog by name/category. Excludes fee/service lines by default. */
export async function searchPorCatalog(
  query: string,
  limit = 8,
  opts: { includeFees?: boolean } = {},
): Promise<Array<PorCatalogItem & { score: number }>> {
  const q = query.trim();
  if (!q) return [];
  const tabletop = isTabletopQuery(q);
  const { items, syncedAt } = await getPorCatalog();
  void syncedAt;
  return items
    .filter((item) => opts.includeFees || !porCatalogIsFee(item))
    .map((item) => {
      let score = Math.max(
        scoreName(q, item.name),
        item.category ? scoreName(q, item.category) * 0.85 : 0,
      );
      if (tabletop && isHardwareNoise(item)) score *= 0.25;
      if (tabletop && item.ratePerDay === 0 && isHardwareNoise(item)) score *= 0.1;
      return { ...item, score };
    })
    .filter((row) => row.score >= 30)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer shorter merchandise names over "_A.S PURLIN…" style SKUs on ties.
      const aUgly = /^[^a-z0-9]/i.test(a.name) ? 1 : 0;
      const bUgly = /^[^a-z0-9]/i.test(b.name) ? 1 : 0;
      if (aUgly !== bUgly) return aUgly - bUgly;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return (b.qty || 0) - (a.qty || 0);
    })
    .slice(0, limit);
}

/** Best exact-ish catalog entry for a known item name (for rate/availability lookup). */
export async function findPorCatalogItemByName(
  name: string,
  minScore = 60,
): Promise<PorCatalogItem | null> {
  const hits = await searchPorCatalog(name, 3);
  const best = hits[0];
  return best && best.score >= minScore ? best : null;
}

/** Whether the durable catalog has been synced (non-empty). */
export async function porCatalogIsSynced(): Promise<boolean> {
  const { items, syncedAt } = await getPorCatalog();
  return items.length > 0 && Boolean(syncedAt);
}
