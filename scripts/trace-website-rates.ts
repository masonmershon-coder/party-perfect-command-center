/**
 * Trace displayed website catalog rates against local POR catalog.
 * Does not change presentation or POR pricing.
 *
 *   npx tsx scripts/trace-website-rates.ts
 *
 * Writes AI-HANDOFF/EVIDENCE/WEBSITE-RATES-TRACE-001.md
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { getPorCatalog } from "../lib/por-catalog";

const SITE = "https://www.partyperfecteventrental.com";
const UA = "PartyPerfectCommandCenter/1.0 (+website-rate-trace)";
const CATEGORY_LIMIT = 18;
const CONCURRENCY = 4;

type Listing = {
  categoryId: string;
  categoryName: string;
  key: string;
  name: string;
  websiteRateText: string;
  websiteRate: number | null;
};

function parseMoney(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function cents(n: number): number {
  return Math.round(n * 100);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function parseCategories(html: string): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  const re =
    /href=["']equipment\.asp\?action=category&(?:amp;)?category=(\d+)["'][^>]*>([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: m[2].replace(/&amp;/g, "&").trim() });
  }
  return out;
}

function parseListings(html: string, categoryId: string, categoryName: string): Listing[] {
  const items: Listing[] = [];
  const seen = new Set<string>();
  const re =
    /href=['"]equipment\.asp\?action=category&(?:amp;)?category=(\d+)&(?:amp;)?key=([^'"]+)['"][\s\S]{0,500}?<div class=['"]multicolheading['"]>([^<]*)<\/div>\s*<div class=['"]multicoldescr['"]>([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const key = decodeURIComponent(m[2]).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const descr = m[4].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").trim();
    items.push({
      categoryId: m[1] || categoryId,
      categoryName,
      key,
      name: m[3].replace(/&amp;/g, "&").trim() || key,
      websiteRateText: descr,
      websiteRate: parseMoney(descr),
    });
  }
  return items;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () =>
      worker(),
    ),
  );
  return out;
}

async function main() {
  const por = await getPorCatalog();
  const bySku = new Map(
    por.items.map((item) => [item.sku.toLowerCase(), item]),
  );

  const home = await fetchText(`${SITE}/equipment.asp`);
  const categories = parseCategories(home).slice(0, CATEGORY_LIMIT);
  if (categories.length === 0) {
    throw new Error("No equipment categories found on the public site.");
  }

  const batches = await mapPool(categories, CONCURRENCY, async (cat) => {
    try {
      const html = await fetchText(
        `${SITE}/equipment.asp?action=category&category=${cat.id}`,
      );
      return parseListings(html, cat.id, cat.name);
    } catch (err) {
      console.error(`category ${cat.id} failed:`, (err as Error).message);
      return [] as Listing[];
    }
  });

  const listings = batches.flat();
  let okMatch = 0;
  let mismatch = 0;
  let blankWebsitePorHasRate = 0;
  let blankWebsitePorZero = 0;
  let unmatchedSku = 0;
  const mismatchRows: string[] = [];
  const blankRows: string[] = [];

  for (const row of listings) {
    const porItem = bySku.get(row.key.toLowerCase());
    if (!porItem) {
      unmatchedSku += 1;
      continue;
    }
    const websiteBlank = row.websiteRate == null;
    if (websiteBlank) {
      if (porItem.ratePerDay > 0) {
        blankWebsitePorHasRate += 1;
        if (blankRows.length < 25) {
          blankRows.push(
            `| ${row.key} | ${row.name.replace(/\|/g, "/")} | (blank) | ${porItem.ratePerDay} | ${row.categoryName} |`,
          );
        }
      } else {
        blankWebsitePorZero += 1;
      }
      continue;
    }
    if (cents(row.websiteRate!) !== cents(porItem.ratePerDay)) {
      mismatch += 1;
      if (mismatchRows.length < 25) {
        mismatchRows.push(
          `| ${row.key} | ${row.name.replace(/\|/g, "/")} | ${row.websiteRate} | ${porItem.ratePerDay} | ${row.categoryName} |`,
        );
      }
      continue;
    }
    okMatch += 1;
  }

  const md = `# WEBSITE-RATES-TRACE-001

**Owner:** Cursor · **Do not change presentation from this trace alone.**  
**Date:** ${new Date().toISOString()}  
**POR catalog:** ${por.syncedAt || "(local)"} · ${por.items.length} SKUs · source ${por.source || "unknown"}  
**Website sample:** ${categories.length} categories · ${listings.length} listing rows from ${SITE}/equipment.asp

## Decision

Do **not** invent rates. Do **not** change POR pricing logic.  
Website listing rates that match POR SKU keys should stay as-is.  
Blank website rates where POR has a rate are a **display gap** — do not copy POR rates onto the public site in this pass (call/showroom quote remains valid).

## Counts

| Bucket | Count |
|--------|------:|
| Website rate matches POR (same SKU key, cents) | ${okMatch} |
| Website rate ≠ POR rate (same SKU) | ${mismatch} |
| Website blank, POR rate > 0 | ${blankWebsitePorHasRate} |
| Website blank, POR rate 0 / kit-style | ${blankWebsitePorZero} |
| Website key not in POR catalog | ${unmatchedSku} |
| Listing rows sampled | ${listings.length} |

## Blank website + POR has rate (sample)

${blankRows.length ? `| SKU | Name | Website | POR/day | Category |\n|-----|------|---------|--------:|----------|\n${blankRows.join("\n")}` : "_None in this sample._"}

## Rate mismatch (sample)

${mismatchRows.length ? `| SKU | Name | Website | POR/day | Category |\n|-----|------|---------|--------:|----------|\n${mismatchRows.join("\n")}` : "_None in this sample._"}

## Categories sampled

${categories.map((c) => `- ${c.id} ${c.name}`).join("\n")}
`;

  const out = join(process.cwd(), "AI-HANDOFF/EVIDENCE/WEBSITE-RATES-TRACE-001.md");
  writeFileSync(out, md);
  console.log(md);
  console.log("wrote", out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
