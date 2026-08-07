import { grokClient } from "@/lib/grok";
import { searchPorCatalog } from "@/lib/por-catalog";
import type { DesignMatchedItem, PorCatalogItem } from "@/lib/types";
import {
  ensureWebsiteCatalogFresh,
  getWebsiteCatalog,
  isWebsiteCatalogStale,
  matchInventoryForDesign,
  searchWebsiteCatalog,
  toMatchedDesignItems,
} from "@/lib/website-catalog";

/**
 * Madison looks at a showroom photo + command and pulls matching website/POR
 * rental SKUs herself — no manual catalog tapping required.
 */
export async function madisonLinkInventoryForLook(input: {
  command: string;
  /** First look-board image (https or data URI) */
  imageUrl?: string;
  /** Staff-picked keys still win / merge first */
  preferredKeys?: string[];
  limit?: number;
}): Promise<{
  matchedItems: DesignMatchedItem[];
  catalogReady: boolean;
  catalogTotal: number;
  usedVision: boolean;
  searchTerms: string[];
}> {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 12);

  let catalog = await getWebsiteCatalog();
  if (isWebsiteCatalogStale(catalog)) {
    try {
      // Madison refreshes her own product photo library when stale/empty.
      catalog = await ensureWebsiteCatalogFresh();
    } catch (err) {
      console.error("[madison-inventory] catalog ensure failed:", err);
      // Fall through with whatever we have (may be empty).
      catalog = await getWebsiteCatalog();
    }
  }

  const byKey = new Map<string, DesignMatchedItem>();

  // 1) Staff picks (if any)
  if (input.preferredKeys?.length) {
    const preferred = catalog.items.filter((item) =>
      input.preferredKeys!.includes(item.key),
    );
    for (const row of await toMatchedDesignItems(
      preferred.map((item) => ({ ...item, score: 100 })),
    )) {
      byKey.set(row.key, row);
    }
  }

  // 2) Vision: Madison describes what’s in the photo as searchable rental terms
  const searchTerms: string[] = [];
  let usedVision = false;
  if (input.imageUrl && catalog.items.length > 0) {
    try {
      const terms = await describeRentalPiecesFromPhoto(
        input.imageUrl,
        input.command,
      );
      usedVision = terms.length > 0;
      searchTerms.push(...terms);
      for (const term of terms) {
        const hits = await searchWebsiteCatalog(term, 4);
        for (const hit of hits) {
          if (byKey.has(hit.key)) continue;
          const [matched] = await toMatchedDesignItems([hit]);
          if (matched) byKey.set(matched.key, matched);
          if (byKey.size >= limit) break;
        }
        if (byKey.size >= limit) break;
      }
    } catch (err) {
      console.error("[madison-inventory] vision match failed:", err);
    }
  }

  // 3) Text match from the staff command
  if (byKey.size < limit && input.command.trim()) {
    const textHits = await matchInventoryForDesign(input.command, limit);
    for (const hit of textHits) {
      if (byKey.has(hit.key)) continue;
      byKey.set(hit.key, hit);
      if (byKey.size >= limit) break;
    }
  }

  // 4) Full POR catalog: surface items we own even if they aren't on the website
  //    (no product photo, but real name + rate + availability for the quote).
  if (byKey.size < limit) {
    const seenNames = new Set(
      [...byKey.values()].map((m) => m.name.toLowerCase()),
    );
    const queries = [...searchTerms, input.command].filter(
      (q) => q && q.trim().length >= 3,
    );
    for (const q of queries) {
      const hits = await searchPorCatalog(q, 4);
      for (const hit of hits) {
        const key = `por:${hit.sku}`;
        if (byKey.has(key) || seenNames.has(hit.name.toLowerCase())) continue;
        byKey.set(key, porCatalogToMatched(hit));
        seenNames.add(hit.name.toLowerCase());
        if (byKey.size >= limit) break;
      }
      if (byKey.size >= limit) break;
    }
  }

  return {
    matchedItems: [...byKey.values()].slice(0, limit),
    catalogReady: catalog.items.length > 0,
    catalogTotal: catalog.items.length,
    usedVision,
    searchTerms,
  };
}

function porCatalogToMatched(
  item: PorCatalogItem & { score?: number },
): DesignMatchedItem {
  return {
    key: `por:${item.sku}`,
    name: item.name,
    categoryName: item.category || undefined,
    porItemId: item.sku,
    porAvailable: item.available,
    porPricePerDay: item.ratePerDay > 0 ? item.ratePerDay : undefined,
    source: "por",
    score: item.score ?? 60,
  };
}

async function describeRentalPiecesFromPhoto(
  imageUrl: string,
  command: string,
): Promise<string[]> {
  const res = await grokClient.chat.completions.create({
    model: "grok-4.3",
    messages: [
      {
        role: "system",
        content: [
          "You are Madison for Party Perfect Event Rentals (Tulsa).",
          "Look at the showroom / tablescape photo and list rental products we likely rent.",
          "Return ONLY a JSON array of 4–8 short search phrases for our website catalog.",
          'Example: ["blue patterned linen","crossback chair","gold charger","clear wine glass"]',
          "Focus on: linen color/pattern, chair style, table shape, china, chargers, glassware, centerpiece type.",
          "No markdown, no commentary — JSON array only.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Staff command: ${command || "(none)"}\nList the Party Perfect rental pieces visible.`,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
        ],
      },
    ] as never,
    max_tokens: 220,
  });

  const raw = res.choices[0]?.message?.content?.trim() || "";
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 3 && v.length <= 60)
    .slice(0, 8);
}
