import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { getPorCatalog, porCatalogIsSynced, searchPorCatalog } from "@/lib/por-catalog";
import { rankPickerOptions, toPickerOptions } from "@/lib/por-kits";

export const runtime = "nodejs";

/**
 * GET ?q=gold+charger&limit=8 — catalog browse for Quoting tab.
 *
 * Kit headers (ItemFile.TYPE 'K') are expanded to their real components before
 * they reach the picker. Without this the girl is offered rows reading
 * "$0/day · 0 avail" while the actually-rentable items stay hidden.
 * See lib/por-kits.ts.
 */
export async function GET(request: Request) {
  const gate = await requireApiAuth("por");
  if (isAuthError(gate)) return gate;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit") || 8);
    const safeLimit = Number.isFinite(limit) ? limit : 8;
    const [matches, synced, catalog] = await Promise.all([
      // Over-fetch: one kit header can expand into several components.
      searchPorCatalog(q, safeLimit * 3),
      porCatalogIsSynced(),
      getPorCatalog(),
    ]);

    const items = rankPickerOptions(toPickerOptions(matches, catalog))
      .slice(0, safeLimit)
      .map((opt) => ({
        ...opt.item,
        viaKitName: opt.viaKitName,
        viaKitSku: opt.viaKitSku,
        suggestedQuantity: opt.suggestedQuantity,
        ratePerDay: opt.specialDailyAmount ?? opt.item.ratePerDay,
      }));

    return privateJson({
      items,
      synced,
      itemCount: catalog.items.length,
      syncedAt: catalog.syncedAt || null,
      kitsLoaded: Array.isArray(catalog.kitMembers) && catalog.kitMembers.length > 0,
    });
  } catch (err) {
    return privateJson(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
