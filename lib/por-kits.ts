import type { PorCatalogItem, PorCatalogState, PorKitMember } from "@/lib/types";

/**
 * Kit resolution for the POR catalog.
 *
 * POR's ItemFile.TYPE 'K' = "Rental - Package" — a KIT HEADER. Kit headers
 * carry qty 0 and rate 0 BY DESIGN; stock and price live on their components.
 * Counter shows the girl the kit and she picks which component and how many.
 *
 * The bug this fixes: the quote picker was showing kit headers alongside real
 * items, so "white folding chairs" offered three rows all reading "$0/day ·
 * 0 avail" while the 348 + 988 actually-rentable chairs never surfaced.
 *
 * Rule: never present a kit header as stock, and never silently auto-pick a
 * component — POR requires the selection, so the UI must ask.
 *
 * Evidence: "00 - Reference/POR_OPERATING_SYSTEM_MAP.md" §5.
 */

/** ItemFile.TYPE values that are kit headers. */
const KIT_TYPE = "K";

/** ItemFile.TYPE values that are non-stock headers/labels, not rentable rows. */
const HEADER_TYPES = new Set(["E", "V"]);

export function isKitHeader(item: Pick<PorCatalogItem, "itemType">): boolean {
  return (item.itemType || "").trim().toUpperCase() === KIT_TYPE;
}

export function isHeaderOnly(item: Pick<PorCatalogItem, "itemType">): boolean {
  return HEADER_TYPES.has((item.itemType || "").trim().toUpperCase());
}

/**
 * True when the row is something a girl can actually put on a ticket as stock.
 * Kit headers are excluded here — they are offered via {@link expandKit}.
 */
export function isRentableStockRow(item: PorCatalogItem): boolean {
  return !isKitHeader(item) && !isHeaderOnly(item);
}

export interface KitComponentOption {
  item: PorCatalogItem;
  /** Fixed quantity from ItemKits, or 0 when the operator chooses. */
  quantity: number;
  /** Grouping key from ItemKits.MultiGroup — options within a group are alternatives. */
  multiGroup?: string;
  /** Kit-specific daily rate when UseSpecialRate is set; otherwise use the item's own. */
  specialDailyAmount?: number;
}

export interface ResolvedKit {
  kit: PorCatalogItem;
  options: KitComponentOption[];
  /**
   * True when the operator must choose (any component has quantity 0, or there
   * is more than one option). A kit like this must never be auto-resolved.
   */
  requiresSelection: boolean;
}

function indexByNum(items: PorCatalogItem[]): Map<string, PorCatalogItem> {
  const map = new Map<string, PorCatalogItem>();
  for (const item of items) {
    const num = (item.num || "").trim();
    if (num) map.set(num, item);
  }
  return map;
}

function indexBySku(items: PorCatalogItem[]): Map<string, PorCatalogItem> {
  const map = new Map<string, PorCatalogItem>();
  for (const item of items) {
    const sku = (item.sku || "").trim();
    if (sku) map.set(sku, item);
  }
  return map;
}

function groupMembers(members: PorKitMember[]): Map<string, PorKitMember[]> {
  const map = new Map<string, PorKitMember[]>();
  for (const m of members) {
    const key = (m.kitNum || "").trim();
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  }
  return map;
}

/**
 * Resolve one kit header to its real component items.
 * Returns null when the row is not a kit or has no usable members.
 */
export function expandKit(
  kit: PorCatalogItem,
  catalog: PorCatalogState,
): ResolvedKit | null {
  if (!isKitHeader(kit)) return null;
  const kitNum = (kit.num || "").trim();
  if (!kitNum) return null;

  const members = groupMembers(catalog.kitMembers || []).get(kitNum);
  if (!members || members.length === 0) return null;

  const bySku = indexBySku(catalog.items);
  const options: KitComponentOption[] = [];

  for (const m of members) {
    const component = bySku.get((m.componentSku || "").trim());
    // A component that is missing, inactive, or itself a kit is not offerable.
    if (!component || isKitHeader(component)) continue;
    options.push({
      item: component,
      quantity: m.quantity || 0,
      multiGroup: m.multiGroup || undefined,
      specialDailyAmount: m.useSpecialRate ? m.dailyAmount : undefined,
    });
  }

  if (options.length === 0) return null;

  const requiresSelection =
    options.length > 1 || options.some((o) => o.quantity === 0);

  return { kit, options, requiresSelection };
}

/**
 * Turn a raw catalog match list into what the picker should show.
 *
 * Kit headers are replaced by their components, tagged with the kit they came
 * from so the UI can keep the familiar "White Satin Linens" grouping the girls
 * already think in. Rows that resolve to nothing are dropped rather than shown
 * as $0/0-available.
 */
export interface PickerOption {
  item: PorCatalogItem;
  /** Set when this option came from a kit — the kit's display name. */
  viaKitName?: string;
  viaKitSku?: string;
  /** Fixed qty from the kit, when POR specifies one. */
  suggestedQuantity?: number;
  specialDailyAmount?: number;
}

export function toPickerOptions(
  matches: PorCatalogItem[],
  catalog: PorCatalogState,
): PickerOption[] {
  const out: PickerOption[] = [];
  const seen = new Set<string>();

  const push = (opt: PickerOption) => {
    const key = `${opt.item.sku}|${opt.viaKitSku || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(opt);
  };

  for (const match of matches) {
    if (isHeaderOnly(match)) continue;

    if (isKitHeader(match)) {
      const resolved = expandKit(match, catalog);
      if (!resolved) continue; // unresolvable kit: drop, don't show $0/0
      for (const opt of resolved.options) {
        push({
          item: opt.item,
          viaKitName: match.name,
          viaKitSku: match.sku,
          suggestedQuantity: opt.quantity > 0 ? opt.quantity : undefined,
          specialDailyAmount: opt.specialDailyAmount,
        });
      }
      continue;
    }

    push({ item: match });
  }

  return out;
}

/**
 * Ranking for the picker. Real availability and a real rate win ties — but this
 * is a tiebreak on top of correct kit expansion, not a substitute for it.
 */
export function rankPickerOptions(options: PickerOption[]): PickerOption[] {
  return [...options].sort((a, b) => {
    const aLive = a.item.available > 0 ? 1 : 0;
    const bLive = b.item.available > 0 ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    const aRate = a.item.ratePerDay > 0 ? 1 : 0;
    const bRate = b.item.ratePerDay > 0 ? 1 : 0;
    if (aRate !== bRate) return bRate - aRate;
    return b.item.available - a.item.available;
  });
}
