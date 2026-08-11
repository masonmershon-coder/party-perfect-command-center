/**
 * Canonical POR metrics — ONE source of truth for dashboard tiles + Mike/Madison.
 * Computed from the read-only ENTERPRISE snapshot (rentable stock only).
 */
import {
  clampQty,
  collectNegativeQtyRows,
  isFeeCategoryCode,
  isRentable,
  type PorReconciliationRow,
} from "@/lib/por-rentable";
import type { PorSnapshot } from "@/lib/types";

/** Snake_case keys agents must quote verbatim. */
export type PorCanonicalMetrics = {
  synced_at: string;
  items_out_rentable: number;
  items_available: number;
  /** Sum of rentable owned qty (clamped). */
  items_owned_rentable: number;
  skus_rentable: number;
  open_contracts: number;
  deliveries_today: number;
  returns_due: number;
  /** Present only when includeFinancials — otherwise omitted from agent context. */
  payments_24h_count?: number;
  payments_24h_volume?: number;
  ar_open?: number;
  ar_customers?: number;
  /** Explicit honesty for period sales Mike cannot invent. */
  period_sales_note: string;
};

export type PorCanonicalBundle = {
  metrics: PorCanonicalMetrics;
  reconciliation: PorReconciliationRow[];
};

const PERIOD_SALES_NOTE =
  "Monthly/weekly/quarterly revenue and category sales (e.g. July Linens) are NOT in this mirror — look those up in Point of Rental reports. Do not invent period sales.";

/**
 * Compute rentable rollups from snapshot categories (complete) + item-level
 * name filters when items[] is present. Prefer category sums for totals
 * (items[] is top-N only and would undercount).
 */
export function computePorCanonicalMetrics(
  snapshot: PorSnapshot,
  options?: { includeFinancials?: boolean },
): PorCanonicalBundle {
  const includeFinancials = options?.includeFinancials === true;

  const rentableCats = snapshot.inventory.categories.filter(
    (c) => !isFeeCategoryCode(c.name),
  );

  let items_owned_rentable = 0;
  let items_available = 0;
  let skus_rentable = 0;

  for (const c of rentableCats) {
    skus_rentable += clampQty(c.itemCount);
    items_owned_rentable += clampQty(c.quantity);
    items_available += clampQty(c.available);
  }

  // Out = owned − available on rentable categories (never negative).
  const items_out_rentable = Math.max(
    0,
    items_owned_rentable - items_available,
  );

  const itemRows = snapshot.inventory.items ?? [];
  const reconciliation = collectNegativeQtyRows(
    itemRows.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      available: i.available,
    })),
  );

  const metrics: PorCanonicalMetrics = {
    synced_at: snapshot.syncedAt,
    items_out_rentable,
    items_available,
    items_owned_rentable,
    skus_rentable,
    open_contracts: clampQty(snapshot.ops.openContracts),
    deliveries_today: clampQty(snapshot.ops.deliveriesToday),
    returns_due: clampQty(snapshot.ops.returnsDueToday),
    period_sales_note: PERIOD_SALES_NOTE,
  };

  if (includeFinancials) {
    metrics.payments_24h_count = clampQty(
      snapshot.money.paymentsLast24h.count,
    );
    metrics.payments_24h_volume = Number(
      snapshot.money.paymentsLast24h.volume,
    );
    if (!Number.isFinite(metrics.payments_24h_volume)) {
      metrics.payments_24h_volume = 0;
    }
    metrics.ar_open = Number(snapshot.money.arOpenBalance) || 0;
    metrics.ar_customers = clampQty(snapshot.money.arCustomerCount);
  }

  return { metrics, reconciliation };
}

/** Agent-facing block — quote these fields exactly; no re-derivation. */
export function formatCanonicalMetricsForAgent(
  snapshot: PorSnapshot | null,
  options?: { includeFinancials?: boolean },
): string {
  if (!snapshot) {
    return [
      "CANONICAL POR METRICS: unavailable (no snapshot).",
      "Do not invent inventory, ops, or AR numbers.",
    ].join("\n");
  }

  const { metrics } = computePorCanonicalMetrics(snapshot, options);
  const lines = [
    "CANONICAL POR METRICS (quote these exact numbers — do NOT re-derive from categories, chat history, or raw snapshot blobs):",
    `synced_at: ${metrics.synced_at}`,
    `items_out_rentable: ${metrics.items_out_rentable}`,
    `items_available: ${metrics.items_available}`,
    `items_owned_rentable: ${metrics.items_owned_rentable}`,
    `skus_rentable: ${metrics.skus_rentable}`,
    `open_contracts: ${metrics.open_contracts}`,
    `deliveries_today: ${metrics.deliveries_today}`,
    `returns_due: ${metrics.returns_due}`,
    metrics.period_sales_note,
    "Fee/labor/delivery SKUs (categories 19 + 34 and fee-named lines) are EXCLUDED from items_out_rentable / items_available.",
    "For a specific item (chairs, tables, chargers), use the injected lookup_inventory result — never invent SKU counts.",
  ];

  if (options?.includeFinancials) {
    lines.push(
      `ar_open: ${metrics.ar_open}`,
      `ar_customers: ${metrics.ar_customers}`,
      `payments_24h_count: ${metrics.payments_24h_count}`,
      `payments_24h_volume: ${metrics.payments_24h_volume}`,
    );
  } else {
    lines.push(
      "Financial fields (ar_open, aging, payments_24h_*, revenue, rates): ABSENT — employee session. Never invent or recall them from earlier chat.",
    );
  }

  return lines.join("\n");
}

/** @deprecated Prefer computePorCanonicalMetrics — kept for call sites expecting totals shape. */
export function porInventoryTotalsFromRentable(snapshot: PorSnapshot): {
  totalItems: number;
  totalQuantity: number;
  availableQuantity: number;
  outQuantity: number;
} {
  const { metrics } = computePorCanonicalMetrics(snapshot, {
    includeFinancials: false,
  });
  return {
    totalItems: metrics.skus_rentable,
    totalQuantity: metrics.items_owned_rentable,
    availableQuantity: metrics.items_available,
    outQuantity: metrics.items_out_rentable,
  };
}

export function mapSnapshotItemRentable(
  item: {
    id: string;
    name: string;
    category: string;
    quantity: number;
    available: number;
    pricePerDay?: number;
    status: import("@/lib/types").InventoryStatus;
    notes?: string;
  },
  syncedAt: string,
): import("@/lib/types").InventoryItem | null {
  if (!isRentable({ category: item.category, name: item.name })) {
    return null;
  }
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
