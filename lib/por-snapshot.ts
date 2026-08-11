import {
  formatCanonicalMetricsForAgent,
  porInventoryTotalsFromRentable,
} from "./por-canonical";
import { readDurableJson, writeDurableJson } from "./durable-json";
import {
  clampQty,
  isFeeCategoryCode,
  isFeeItemName,
  isRentable,
} from "./por-rentable";
import type {
  BookkeepingEntry,
  InventoryItem,
  PorSnapshot,
  PorSyncMeta,
} from "./types";

export const POR_SNAPSHOT_KEY = "por-snapshot.json";
export const POR_SYNC_STALE_MS = 30 * 60 * 1000;

/** @deprecated Prefer isFeeCategoryCode / isRentable from por-rentable. */
export function isFeeCategory(category: string | undefined | null): boolean {
  return isFeeCategoryCode(category);
}

/**
 * Rentable inventory totals (excludes fee/labor cats 19+34 and fee-named lines).
 * Single path used by dashboard + agents via por-canonical.
 */
export function porInventoryTotals(snapshot: PorSnapshot): {
  totalItems: number;
  totalQuantity: number;
  availableQuantity: number;
  outQuantity: number;
} {
  return porInventoryTotalsFromRentable(snapshot);
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

function toInventoryRow(
  item: {
    id: string;
    name: string;
    category: string;
    quantity: number;
    available: number;
    pricePerDay?: number;
    status: InventoryItem["status"];
    notes?: string;
  },
  syncedAt: string,
): InventoryItem {
  const quantity = clampQty(item.quantity);
  const available = clampQty(item.available);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity,
    available,
    pricePerDay: item.pricePerDay ?? 0,
    status: item.status,
    notes: item.notes ?? "Live from Point of Rental (read-only)",
    updatedAt: syncedAt,
  };
}

/** Default inventory list — rentable stock only (fees excluded). */
export function inventoryFromPorSnapshot(
  snapshot: PorSnapshot,
): InventoryItem[] {
  if (snapshot.inventory.items?.length) {
    return snapshot.inventory.items
      .filter((item) => isRentable({ category: item.category, name: item.name }))
      .map((item) => toInventoryRow(item, snapshot.syncedAt));
  }

  return snapshot.inventory.categories
    .filter((category) => !isFeeCategoryCode(category.name))
    .map((category, index) => {
      const quantity = clampQty(Math.round(category.quantity));
      const available = clampQty(Math.round(category.available));
      const out = Math.max(0, quantity - available);
      return {
        id: `por-cat-${index}-${category.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: `Category ${category.name}`,
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

/** Fee / labor / delivery lines — viewable under Fees & Services only. */
export function feesFromPorSnapshot(snapshot: PorSnapshot): InventoryItem[] {
  if (!snapshot.inventory.items?.length) {
    return snapshot.inventory.categories
      .filter((category) => isFeeCategoryCode(category.name))
      .map((category, index) => {
        const quantity = clampQty(Math.round(category.quantity));
        const available = clampQty(Math.round(category.available));
        return {
          id: `por-fee-cat-${index}-${category.name}`,
          name: `Fee category ${category.name}`,
          category: category.name,
          quantity,
          available,
          pricePerDay: 0,
          status: "available" as const,
          notes: `Fees & services · ${category.itemCount} SKUs — excluded from stock math`,
          updatedAt: snapshot.syncedAt,
        };
      });
  }

  return snapshot.inventory.items
    .filter(
      (item) =>
        isFeeCategoryCode(item.category) || isFeeItemName(item.name),
    )
    .map((item) =>
      toInventoryRow(
        {
          ...item,
          notes:
            item.notes ??
            "Fee/service line — excluded from rentable stock math",
        },
        snapshot.syncedAt,
      ),
    );
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
      // SQL Aging30 = AgeDate 31–60 days ago (field name is historical).
      vendor: "POR AR · 31–60 days",
      description: "Aging bucket: 31–60 days past AgeDate",
      amount: aging.days30,
      status: aging.days30 > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR AR · 61–90 days",
      description: "Aging bucket: 61–90 days past AgeDate",
      amount: aging.days60,
      status: aging.days60 > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR AR · 91–120 days",
      description: "Aging bucket: 91–120 days past AgeDate",
      amount: aging.days90,
      status: aging.days90 > 0 ? "overdue" : "paid",
    },
    {
      vendor: "POR AR · 120+ days",
      description: "Aging bucket: 120+ days past AgeDate",
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
  // Default LOCKED — callers must opt in with includeFinancials: true (owner only).
  const includeFinancials = options?.includeFinancials === true;

  if (!snapshot || !meta.present) {
    return [
      "POR live snapshot: not available yet.",
      "Point of Rental remains the system of record. Do not invent inventory or AR numbers.",
      formatCanonicalMetricsForAgent(null, { includeFinancials }),
    ].join("\n");
  }

  const staleNote = meta.stale
    ? "WARNING: POR sync is STALE — prefer last-known numbers and say they may be outdated."
    : "POR sync is fresh (within 30 minutes).";

  const lines = [
    "Live Point of Rental snapshot (read-only copy — never claim you can change POR):",
    "IMPORTANT: Quote CANONICAL POR METRICS below verbatim. Ignore conflicting numbers from earlier chat turns.",
    staleNote,
    `Source host: ${snapshot.sourceHost}`,
    formatCanonicalMetricsForAgent(snapshot, { includeFinancials }),
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
            const avail = `avail ${clampQty(s.available)}`;
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
      `Aging detail (by AgeDate): current/0–30 $${snapshot.money.aging.current.toFixed(2)} · 31–60 $${snapshot.money.aging.days30.toFixed(2)} · 61–90 $${snapshot.money.aging.days60.toFixed(2)} · 91–120 $${snapshot.money.aging.days90.toFixed(2)} · 120+ $${snapshot.money.aging.days120Plus.toFixed(2)}`,
    );
    if (snapshot.money.revenue) {
      const r = snapshot.money.revenue;
      lines.push(
        `Revenue collected (from POR payments): this week $${r.last7Days.toFixed(2)} · month-to-date $${r.monthToDate.toFixed(2)} · last 30 days $${r.last30Days.toFixed(2)} · year-to-date $${r.yearToDate.toFixed(2)}`,
      );
    } else {
      lines.push(
        "Revenue-over-time buckets: not in this snapshot. Period sales still live in POR reports — do not invent.",
      );
    }
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
