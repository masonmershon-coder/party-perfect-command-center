"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { PorSyncBanner } from "@/app/components/dashboard/por-sync-banner";
import { StatusBadge } from "@/app/components/status-badge";
import type { InventoryItem, PorSyncMeta } from "@/lib/types";
import { formatCurrency } from "@/lib/ui";
import { FormEvent, useMemo, useState } from "react";

type InventoryTab = "rentable" | "fees";

export function InventorySection({
  inventory,
  fees = [],
  source = "local",
  porMeta = null,
  showRates = true,
  onCreateItem,
}: {
  inventory: InventoryItem[];
  /** Fee/labor/delivery lines — excluded from stock math. */
  fees?: InventoryItem[];
  source?: "por" | "local";
  porMeta?: PorSyncMeta | null;
  /** Rental rates are owner-only (revenue-sensitive). */
  showRates?: boolean;
  onCreateItem: (input: {
    name: string;
    category: string;
    quantity: number;
    available: number;
    pricePerDay: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Tents");
  const [quantity, setQuantity] = useState(10);
  const [available, setAvailable] = useState(10);
  const [pricePerDay, setPricePerDay] = useState(50);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<InventoryTab>("rentable");
  const readOnly = source === "por";

  const rows = useMemo(
    () => (tab === "rentable" ? inventory : fees),
    [tab, inventory, fees],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setLoading(true);
    try {
      await onCreateItem({ name, category, quantity, available, pricePerDay });
      setName("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Warehouse"
        title="Rental Inventory"
        description={
          readOnly
            ? "Rentable stock from Point of Rental (fee/labor lines excluded from counts). POR remains the system of record."
            : "Track tents, seating, linens, and event equipment across the Party Perfect fleet."
        }
      />

      <PorSyncBanner source={source} porMeta={porMeta} label="inventory" />

      {readOnly ? (
        <div className="mb-4 flex gap-2">
          {(
            [
              { id: "rentable" as const, label: `Rentable (${inventory.length})` },
              { id: "fees" as const, label: `Fees & Services (${fees.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                tab === t.id
                  ? "bg-[var(--pp-accent)] text-white"
                  : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:text-[var(--pp-text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "fees" ? (
        <p className="mb-4 text-xs text-[var(--pp-text-muted)]">
          Delivery, setup/breakdown, and labor fees are listed here for
          reference only — they never count toward Out on rent or Low inventory.
        </p>
      ) : null}

      {!readOnly ? (
        <form
          onSubmit={handleSubmit}
          className="pp-panel mb-8 grid gap-3 rounded-2xl p-5 md:grid-cols-5 xl:grid-cols-[1.2fr_0.8fr_0.5fr_0.5fr_0.5fr_auto]"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="pp-input px-4 py-3 text-sm" required />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="pp-input px-4 py-3 text-sm" required />
          <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
          <input type="number" value={available} onChange={(e) => setAvailable(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
          {showRates ? (
            <input type="number" value={pricePerDay} onChange={(e) => setPricePerDay(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
          ) : null}
          <button type="submit" disabled={loading} className="pp-btn-primary w-full px-5 py-3 text-sm md:w-auto">Add</button>
        </form>
      ) : null}

      <div className="pp-panel overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="pp-table-head text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 font-semibold">Item</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="px-5 py-3 font-semibold">Stock</th>
              <th className="px-5 py-3 font-semibold">Available</th>
              {showRates ? (
                <th className="px-5 py-3 font-semibold">Rate/Day</th>
              ) : null}
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={showRates ? 6 : 5}
                  className="px-5 py-8 text-center text-sm text-[var(--pp-text-muted)]"
                >
                  {tab === "fees"
                    ? "No fee/service lines in this snapshot sample."
                    : "No rentable inventory rows."}
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const lowStock =
                  tab === "rentable" &&
                  item.available / Math.max(item.quantity, 1) < 0.25;
                return (
                  <tr key={item.id} className="border-t border-[var(--pp-border)]">
                    <td className="px-5 py-4">
                      <p className="font-medium text-[var(--pp-text)]">{item.name}</p>
                      {item.notes && (
                        <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                          {item.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[var(--pp-text-muted)]">
                      {item.category}
                    </td>
                    <td className="px-5 py-4">{item.quantity}</td>
                    <td
                      className={`px-5 py-4 ${
                        lowStock ? "font-semibold pp-accent-text" : ""
                      }`}
                    >
                      {item.available}
                    </td>
                    {showRates ? (
                      <td className="px-5 py-4 font-medium pp-accent-text">
                        {item.pricePerDay > 0
                          ? formatCurrency(item.pricePerDay)
                          : "—"}
                      </td>
                    ) : null}
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} kind="inventory" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
