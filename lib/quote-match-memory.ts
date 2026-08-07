import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import { searchPorCatalog } from "@/lib/por-catalog";
import type { PorCatalogItem } from "@/lib/types";

/**
 * Madison learns from showroom girls: when they pick the right SKU for a
 * vision/search term ("gold charger" → Champagne Reef Charger), we remember
 * and boost that match next time.
 */
const KEY = "quote-match-memory.json";

export type QuoteMatchMemoryEntry = {
  /** Normalized search / vision term */
  term: string;
  sku: string;
  name: string;
  hits: number;
  updatedAt: string;
  createdBy?: string;
};

export type QuoteMatchMemoryState = {
  entries: QuoteMatchMemoryEntry[];
  updatedAt: string;
};

function empty(): QuoteMatchMemoryState {
  return { entries: [], updatedAt: "" };
}

export function normalizeMatchTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getQuoteMatchMemory(): Promise<QuoteMatchMemoryState> {
  return readDurableJson<QuoteMatchMemoryState>(KEY, empty());
}

export async function rememberQuoteMatch(input: {
  term: string;
  sku: string;
  name: string;
  createdBy?: string;
}): Promise<QuoteMatchMemoryEntry> {
  const term = normalizeMatchTerm(input.term);
  const sku = String(input.sku || "").trim();
  if (!term || !sku) {
    throw new Error("term and sku are required to remember a match.");
  }
  const state = await getQuoteMatchMemory();
  const now = new Date().toISOString();
  const existing = state.entries.find(
    (e) => e.term === term && e.sku === sku,
  );
  let entry: QuoteMatchMemoryEntry;
  if (existing) {
    entry = {
      ...existing,
      name: input.name || existing.name,
      hits: existing.hits + 1,
      updatedAt: now,
      createdBy: input.createdBy || existing.createdBy,
    };
    state.entries = state.entries.map((e) =>
      e.term === term && e.sku === sku ? entry : e,
    );
  } else {
    entry = {
      term,
      sku,
      name: input.name || sku,
      hits: 1,
      updatedAt: now,
      createdBy: input.createdBy,
    };
    state.entries.unshift(entry);
  }
  // Keep memory bounded
  state.entries = state.entries
    .sort((a, b) => b.hits - a.hits || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 2000);
  state.updatedAt = now;
  await writeDurableJson(KEY, state);
  return entry;
}

/** Best remembered SKUs for a term (exact term first, then fuzzy contains). */
export async function rememberedSkusForTerm(
  term: string,
  limit = 2,
): Promise<QuoteMatchMemoryEntry[]> {
  const q = normalizeMatchTerm(term);
  if (!q) return [];
  const { entries } = await getQuoteMatchMemory();
  const exact = entries.filter((e) => e.term === q);
  if (exact.length) return exact.slice(0, limit);
  return entries
    .filter((e) => e.term.includes(q) || q.includes(e.term))
    .slice(0, limit);
}

/**
 * Top-N catalog candidates for a term, with learned SKUs pinned first.
 * Keeps the girl-in-the-loop: usually 2 options, not a pile of guesses.
 */
export async function candidatesForTermWithMemory(
  term: string,
  qty: number,
  perItem = 2,
): Promise<{
  qty: number;
  term: string;
  candidates: Array<PorCatalogItem & { score: number; learned?: boolean }>;
}> {
  const per = Math.min(Math.max(perItem, 1), 4);
  const remembered = await rememberedSkusForTerm(term, per);
  const { getPorCatalog } = await import("@/lib/por-catalog");
  const { items } = await getPorCatalog();
  const bySku = new Map(items.map((i) => [i.sku, i]));
  const out: Array<PorCatalogItem & { score: number; learned?: boolean }> = [];
  const seen = new Set<string>();

  for (const mem of remembered) {
    const hit = bySku.get(mem.sku);
    if (!hit || seen.has(hit.sku)) continue;
    seen.add(hit.sku);
    out.push({ ...hit, score: 100 + mem.hits, learned: true });
  }

  const catalogHits = await searchPorCatalog(term, per + 2);
  for (const hit of catalogHits) {
    if (seen.has(hit.sku)) continue;
    seen.add(hit.sku);
    out.push({ ...hit, learned: false });
    if (out.length >= per) break;
  }

  return { qty, term, candidates: out.slice(0, per) };
}
