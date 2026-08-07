import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import { findPorCatalogItemByName } from "@/lib/por-catalog";
import { getPorSnapshot } from "@/lib/por-snapshot";
import type {
  DesignMatchedItem,
  PorInventoryItemSnapshot,
  WebsiteCatalogItem,
  WebsiteCatalogState,
} from "@/lib/types";

const CATALOG_KEY = "website-catalog.json";
const SITE = "https://www.partyperfecteventrental.com";
const USER_AGENT = "PartyPerfectCommandCenter/1.0 (+madison-design-studio)";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENCY = 5;

function emptyCatalog(): WebsiteCatalogState {
  return {
    items: [],
    syncedAt: "",
    source: SITE,
    categoryCount: 0,
  };
}

export async function getWebsiteCatalog(): Promise<WebsiteCatalogState> {
  const state = await readDurableJson<WebsiteCatalogState>(
    CATALOG_KEY,
    emptyCatalog(),
  );
  return {
    ...emptyCatalog(),
    ...state,
    items: Array.isArray(state.items) ? state.items : [],
  };
}

export function isWebsiteCatalogStale(state: WebsiteCatalogState): boolean {
  if (!state.syncedAt || state.items.length === 0) return true;
  const t = Date.parse(state.syncedAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_MS;
}

/**
 * Madison self-maintains the website product photo cache.
 * Uses the cached index when fresh; crawls the public site when empty/stale.
 */
export async function ensureWebsiteCatalogFresh(options?: {
  force?: boolean;
}): Promise<WebsiteCatalogState> {
  const current = await getWebsiteCatalog();
  if (!options?.force && !isWebsiteCatalogStale(current)) {
    return current;
  }
  return syncWebsiteCatalog();
}

function nameFromAlt(alt: string): string {
  let s = alt.trim();
  s = s.replace(/^Rental store for\s+/i, "");
  s = s.replace(/^Where to rent\s+/i, "");
  s = s.replace(/\s+in Tulsa OK.*$/i, "");
  s = s.replace(/\s+in Tulsa.*$/i, "");
  s = s.replace(/\s+Oklahoma City.*$/i, "");
  return s.trim() || alt.trim();
}

function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${SITE}${path}`;
  return `${SITE}/${path}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Catalog fetch failed (${res.status}): ${url}`);
  return res.text();
}

function parseCategoryMap(html: string): Map<number, string> {
  const map = new Map<number, string>();
  const re =
    /href=["']equipment\.asp\?action=category&(?:amp;)?category=(\d+)["'][^>]*>([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const id = Number(m[1]);
    const name = m[2].replace(/&amp;/g, "&").trim();
    if (Number.isFinite(id) && name) map.set(id, name);
  }
  return map;
}

function parseCategoryItems(
  html: string,
  categoryId: string,
  categoryName: string,
): WebsiteCatalogItem[] {
  const items: WebsiteCatalogItem[] = [];
  const seen = new Set<string>();
  const re =
    /href='equipment\.asp\?action=category&amp;category=(\d+)&amp;key=([^']+)'[^>]*>\s*<img[^>]+alt='([^']*)'[^>]+src='([^']+)'/gi;

  for (const m of html.matchAll(re)) {
    const key = m[2].trim();
    if (!key || seen.has(key)) continue;
    const src = m[4].trim();
    if (!src.includes("itemimages/")) continue;
    seen.add(key);
    const imageIdMatch = /itemimages\/(\d+)/i.exec(src);
    const name = nameFromAlt(m[3] || key);
    items.push({
      key,
      name,
      categoryId: m[1] || categoryId,
      categoryName,
      imageUrl: absoluteUrl(src),
      pageUrl: `${SITE}/equipment.asp?action=category&category=${m[1] || categoryId}&key=${encodeURIComponent(key)}`,
      imageId: imageIdMatch?.[1],
    });
  }
  return items;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Crawl partyperfecteventrental.com equipment categories and cache product photos.
 * Same public catalog Madison / June-style flows pull from for real inventory looks.
 */
export async function syncWebsiteCatalog(): Promise<WebsiteCatalogState> {
  const home = await fetchText(`${SITE}/equipment.asp`);
  const categoryMap = parseCategoryMap(home);
  const categoryIds = [...categoryMap.keys()].sort((a, b) => a - b);
  if (categoryIds.length === 0) {
    throw new Error("Could not find equipment categories on the website.");
  }

  const batches = await mapPool(categoryIds, MAX_CONCURRENCY, async (id) => {
    const name = categoryMap.get(id) || `Category ${id}`;
    try {
      const html = await fetchText(
        `${SITE}/equipment.asp?action=category&category=${id}`,
      );
      return parseCategoryItems(html, String(id), name);
    } catch (err) {
      console.error(`[website-catalog] category ${id} failed:`, err);
      return [] as WebsiteCatalogItem[];
    }
  });

  const byKey = new Map<string, WebsiteCatalogItem>();
  for (const list of batches) {
    for (const item of list) {
      byKey.set(item.key, item);
    }
  }

  const state: WebsiteCatalogState = {
    items: [...byKey.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
    syncedAt: new Date().toISOString(),
    source: SITE,
    categoryCount: categoryIds.length,
  };

  await writeDurableJson(CATALOG_KEY, state);
  return state;
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
    else if ([...nTokens].some((nt) => nt.includes(t) || t.includes(nt))) {
      hit += 0.5;
    }
  }
  return (hit / qTokens.length) * 70;
}

export async function searchWebsiteCatalog(
  query: string,
  limit = 24,
): Promise<Array<WebsiteCatalogItem & { score: number }>> {
  const catalog = await getWebsiteCatalog();
  const q = query.trim();
  if (!q) {
    return catalog.items.slice(0, limit).map((item) => ({ ...item, score: 0 }));
  }
  return catalog.items
    .map((item) => ({
      ...item,
      score: Math.max(
        scoreName(q, item.name),
        scoreName(q, item.categoryName),
        scoreName(q, item.key),
      ),
    }))
    .filter((row) => row.score >= 18)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function getWebsiteCatalogItemsByKeys(
  keys: string[],
): Promise<WebsiteCatalogItem[]> {
  if (keys.length === 0) return [];
  const catalog = await getWebsiteCatalog();
  const want = new Set(keys.map((k) => k.trim()).filter(Boolean));
  return catalog.items.filter((item) => want.has(item.key));
}

function bestPorMatch(
  item: WebsiteCatalogItem,
  porItems: PorInventoryItemSnapshot[],
): PorInventoryItemSnapshot | null {
  if (item.imageId) {
    const byId = porItems.find((p) => p.id === item.imageId);
    if (byId) return byId;
  }
  let best: PorInventoryItemSnapshot | null = null;
  let bestScore = 0;
  for (const p of porItems) {
    const s = scoreName(item.name, p.name);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return bestScore >= 55 ? best : null;
}

export async function toMatchedDesignItems(
  catalogItems: Array<WebsiteCatalogItem & { score?: number }>,
): Promise<DesignMatchedItem[]> {
  const snapshot = await getPorSnapshot();
  const porItems = snapshot?.inventory.items || [];
  return Promise.all(
    catalogItems.map(async (item) => {
      // Prefer the FULL POR catalog for rate/availability; fall back to the
      // live snapshot sample (~300 items) when the full catalog has no match.
      const full = await findPorCatalogItemByName(item.name);
      const por = porItems.length ? bestPorMatch(item, porItems) : null;
      const porPricePerDay =
        full && full.ratePerDay > 0 ? full.ratePerDay : por?.pricePerDay;
      return {
        key: item.key,
        name: item.name,
        imageUrl: item.imageUrl,
        pageUrl: item.pageUrl,
        categoryName: item.categoryName,
        porItemId: por?.id ?? full?.sku,
        porAvailable: full?.available ?? por?.available,
        porPricePerDay,
        source: full || por ? "both" : "website",
        score: item.score ?? 100,
      };
    }),
  );
}

/** Fuzzy-match a design command against website catalog (+ POR when available). */
export async function matchInventoryForDesign(
  query: string,
  limit = 8,
): Promise<DesignMatchedItem[]> {
  const hits = await searchWebsiteCatalog(query, limit);
  if (hits.length > 0) return toMatchedDesignItems(hits);

  const snapshot = await getPorSnapshot();
  const porItems = snapshot?.inventory.items || [];
  if (!query.trim() || porItems.length === 0) return [];

  return porItems
    .map((p) => ({ p, score: scoreName(query, p.name) }))
    .filter((row) => row.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p, score }) => ({
      key: `por:${p.id}`,
      name: p.name,
      categoryName: p.category,
      porItemId: p.id,
      porAvailable: p.available,
      porPricePerDay: p.pricePerDay,
      source: "por" as const,
      score,
    }));
}
