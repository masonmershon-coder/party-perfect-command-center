import { readDurableJson, writeDurableJson } from "./durable-json";
import type {
  BookkeepingEntry,
  InventoryItem,
  PorSnapshot,
  PorSyncMeta,
} from "./types";

export const POR_SNAPSHOT_KEY = "por-snapshot.json";
export const POR_SYNC_STALE_MS = 30 * 60 * 1000;

/**
 * POR "FEE - …" and "DISCOUNT" categories are service/fee lines (delivery, setup,
 * labor, waivers), NOT rentable stock. Their QTY/QYOT fields hold garbage counters
 * (e.g. "Delivery Fee $3.50/mi" reports 51,146 in stock), so counting them as
 * inventory inflates out-on-rent and low-stock numbers. Exclude them from stock.
 */
export function isFeeCategory(category: string | undefined | null): boolean {
  const c = (category || "").toUpperCase();
  return c.startsWith("FEE") || c.startsWith("DISCOUNT");
}

/**
 * Real (non-fee) inventory totals recomputed from the snapshot's per-item data so
 * dashboard "out on rent" / "available" reflect rentable stock only. Falls back to
 * non-fee category rollups, then to the stored totals when items aren't present.
 */
export function porInventoryTotals(snapshot: PorSnapshot): {
  totalItems: number;
  totalQuantity: number;
  availableQuantity: number;
  outQuantity: number;
} {
  const items = snapshot.inventory.items;
  if (items?.length) {
    const real = items.filter((i) => !isFeeCategory(i.category));
    const totalQuantity = real.reduce((s, i) => s + Math.max(0, i.quantity), 0);
    const availableQuantity = real.reduce((s, i) => s + Math.max(0, i.available), 0);
    return {
      totalItems: real.length,
      totalQuantity,
      availableQuantity,
      outQuantity: Math.max(0, totalQuantity - availableQuantity),
    };
  }
  const cats = snapshot.inventory.categories.filter((c) => !isFeeCategory(c.name));
  if (cats.length) {
    const totalQuantity = cats.reduce((s, c) => s + Math.max(0, c.quantity), 0);
    const availableQuantity = cats.reduce((s, c) => s + Math.max(0, c.available), 0);
    return {
      totalItems: cats.reduce((s, c) => s + Math.max(0, c.itemCount), 0),
      totalQuantity,
      availableQuantity,
      outQuantity: Math.max(0, totalQuantity - availableQuantity),
    };
  }
  const inv = snapshot.inventory;
  return {
    totalItems: inv.totalItems,
    totalQuantity: inv.totalQuantity,
    availableQuantity: inv.availableQuantity,
    outQuantity: inv.outQuantity,
  };
}

export function isPorSyncConfigured() {
  return Boolean(process.env.POR_SYNC_SECRET?.trim());
}

export async function getPorSnapshot(): Promise<PorSnapshot | null> {
  const snapshot = await readDurableJson<PorSnapshot | null>(
    POR_SNAPSHOT_KEY,
    null,
  );
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!snapshot.syncedAt || snapshot.version !== 1) return null;
  return snapshot;
}

export async function savePorSnapshot(snapshot: PorSnapshot): Promise<void> {
  await writeDurableJson(POR_SNAPSHOT_KEY, snapshot);
  // History removed — was rewriting ~24 full snapshots every sync with no readers.
}

export function getPorSyncMeta(snapshot: PorSnapshot | null): PorSyncMeta {
  if (!snapshot?.syncedAt) {
    return {
      present: false,
      stale: true,
      syncedAt: null,
      ageMs: null,
      sourceHost: null,
    };
  }

  const ageMs = Date.now() - new Date(snapshot.syncedAt).getTime();
  const stale = !Number.isFinite(ageMs) || ageMs > POR_SYNC_STALE_MS;

  return {
    present: true,
    stale,
    syncedAt: snapshot.syncedAt,
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
    sourceHost: snapshot.sourceHost ?? null,
  };
}

export function inventoryFromPorSnapshot(
  snapshot: PorSnapshot,
): InventoryItem[] {
  if (snapshot.inventory.items?.length) {
    return snapshot.inventory.items
      .filter((item) => !isFeeCategory(item.category))
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        available: item.available,
        pricePerDay: item.pricePerDay ?? 0,
        status: item.status,
        notes: item.notes ?? "Live from Point of Rental (read-only)",
        updatedAt: snapshot.syncedAt,
      }));
  }

  return snapshot.inventory.categories
    .filter((category) => !isFeeCategory(category.name))
    .map((category, index) => {
    const quantity = Math.max(0, Math.round(category.quantity));
    const available = Math.max(0, Math.round(category.available));
    const out = Math.max(0, quantity - available);
    return {
      id: `por-cat-${index}-${category.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: category.name,
      category: category.name,
      quantity,
      available,
      pricePerDay: 0,
      status:
        available <= 0
          ? ("reserved" as const)
          : available / Math.max(quantity, 1) < 0.25
            ? ("maintenance" as const)
            : ("available" as const),
      notes: `POR category · ${category.itemCount} SKUs · ${out} out`,
      updatedAt: snapshot.syncedAt,
    };
  });
}

export function bookkeepingFromPorSnapshot(
  snapshot: PorSnapshot,
): BookkeepingEntry[] {
  const { money } = snapshot;
  const aging = money.aging;
  const rows: Array<{
    vendor: string;
    description: string;
    amount: number;
    status: BookkeepingEntry["status"];
  }> = [
    {
      vendor: "POR AR",
      description: "Open accounts receivable (total)",
      amount: money.arOpenBalance,
      status: money.arOpenBalance > 0 ? "pending" : "paid",
    },
    {
      vendor: "POR AR · Current",
      description: "Aging bucket: current",
      amount: aging.current,
      status: aging.current > 0 ? "pending" : "paid",
    },
    {
      vendor: "POR AR · 30 days",
      description: "Aging bucket: 1–30 days",
      amount: aging.days30,
      status: aging.days30 > 0 ? "pending" : "paid",
    },
    {
      vendor: "POR AR · 60 days",
      description: "Aging bucket: 31–60 days",
      amount: aging.days60,
      status: aging.days60 > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR AR · 90 days",
      description: "Aging bucket: 61–90 days",
      amount: aging.days90,
      status: aging.days90 > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR AR · 120+ days",
      description: "Aging bucket: 120+ days",
      amount: aging.days120Plus,
      status: aging.days120Plus > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR Payments · 24h",
      description: `${money.paymentsLast24h.count} payments (summary only, no card data)`,
      amount: money.paymentsLast24h.volume,
      status: "paid",
    },
  ];

  return rows
    .filter((row) => row.amount !== 0 || row.vendor === "POR AR")
    .map((row, index) => ({
      id: `por-bk-${index}`,
      vendor: row.vendor,
      description: row.description,
      amount: Number(row.amount) || 0,
      status: row.status,
      dueDate: undefined,
      updatedAt: snapshot.syncedAt,
    }));
}

export function formatPorContextForAgents(
  snapshot: PorSnapshot | null,
  meta: PorSyncMeta,
  options?: { includeFinancials?: boolean },
): string {
  const includeFinancials = options?.includeFinancials !== false;

  if (!snapshot || !meta.present) {
    return [
      "POR live snapshot: not available yet.",
      "Point of Rental remains the system of record. Do not invent inventory or AR numbers.",
    ].join("\n");
  }

  const staleNote = meta.stale
    ? "WARNING: POR sync is STALE — prefer last-known numbers and say they may be outdated."
    : "POR sync is fresh (within 30 minutes).";

  const invTotals = porInventoryTotals(snapshot);
  const lines = [
    "Live Point of Rental snapshot (read-only copy — never claim you can change POR):",
    staleNote,
    `Synced at: ${snapshot.syncedAt} from ${snapshot.sourceHost}`,
    `Inventory (rentable stock, excludes fee/service lines): ${invTotals.totalItems} items · qty ${invTotals.totalQuantity} · available ${invTotals.availableQuantity} · out ${invTotals.outQuantity}`,
    `Top categories: ${snapshot.inventory.categories
      .filter((c) => !isFeeCategory(c.name))
      .slice(0, 8)
      .map((c) => `${c.name} (${c.available}/${c.quantity})`)
      .join("; ") || "n/a"}`,
    `Ops today: open contracts ${snapshot.ops.openContracts} · deliveries ${snapshot.ops.deliveriesToday} · returns due ${snapshot.ops.returnsDueToday}`,
  ];

  const sales = snapshot.sales;
  if (sales) {
    lines.push(
      `Sales pipeline: open quotes ${sales.openQuotes} · reservations ${sales.openReservations} · quotes with event in next 14 days ${sales.quotesEventWithin14Days} (chase full deposit)`,
    );
    if (sales.serviceItems?.length) {
      lines.push(
        `Service SKUs (use on tickets): ${sales.serviceItems
          .slice(0, 20)
          .map((s) =>
            includeFinancials
              ? `${s.name} ($${s.pricePerDay.toFixed(2)})`
              : s.name,
          )
          .join("; ")}`,
      );
    }
    if (sales.catalogItems?.length) {
      lines.push(
        `Catalog sample for ticket lines (${sales.catalogItems.length} items): ${sales.catalogItems
          .slice(0, 40)
          .map((s) => {
            const avail = `avail ${s.available}`;
            return includeFinancials
              ? `${s.name} [${s.category}] $${s.pricePerDay.toFixed(2)} ${avail}`
              : `${s.name} [${s.category}] ${avail}`;
          })
          .join("; ")}`,
      );
    }
  } else {
    lines.push(
      "Sales pipeline / quote catalog: not in this snapshot yet — update ENTERPRISE Sync-PorSnapshot.ps1.",
    );
  }

  if (includeFinancials) {
    lines.push(
      `AR open: $${snapshot.money.arOpenBalance.toFixed(2)} across ${snapshot.money.arCustomerCount} customers`,
      `Aging: current $${snapshot.money.aging.current.toFixed(2)} · 30 $${snapshot.money.aging.days30.toFixed(2)} · 60 $${snapshot.money.aging.days60.toFixed(2)} · 90 $${snapshot.money.aging.days90.toFixed(2)} · 120+ $${snapshot.money.aging.days120Plus.toFixed(2)}`,
      `Payments last 24h: ${snapshot.money.paymentsLast24h.count} / $${snapshot.money.paymentsLast24h.volume.toFixed(2)}`,
    );
  } else {
    lines.push(
      "Financials (AR, aging, payments, revenue, rates): HIDDEN — employee session. Catalog item names/availability still OK for ticket building.",
    );
  }

  return lines.join("\n");
}

export function isValidPorSnapshot(value: unknown): value is PorSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as PorSnapshot;
  return (
    snap.version === 1 &&
    typeof snap.syncedAt === "string" &&
    typeof snap.sourceHost === "string" &&
    typeof snap.sourceDatabase === "string" &&
    snap.inventory != null &&
    snap.money != null &&
    snap.ops != null &&
    Array.isArray(snap.inventory.categories) &&
    typeof snap.money.arOpenBalance === "number" &&
    typeof snap.ops.openContracts === "number"
  );
}
