"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import type { InventoryItem } from "@/lib/types";
import { formatCurrency } from "@/lib/ui";
import { FormEvent, useState } from "react";

export function InventorySection({
  inventory,
  onCreateItem,
}: {
  inventory: InventoryItem[];
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
        description="Track tents, seating, linens, and event equipment across the Party Perfect fleet."
      />

      <form
        onSubmit={handleSubmit}
        className="pp-panel mb-8 grid gap-3 rounded-2xl p-5 md:grid-cols-5 xl:grid-cols-[1.2fr_0.8fr_0.5fr_0.5fr_0.5fr_auto]"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="pp-input px-4 py-3 text-sm" required />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="pp-input px-4 py-3 text-sm" required />
        <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
        <input type="number" value={available} onChange={(e) => setAvailable(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
        <input type="number" value={pricePerDay} onChange={(e) => setPricePerDay(Number(e.target.value))} className="pp-input px-4 py-3 text-sm" />
        <button type="submit" disabled={loading} className="pp-btn-primary px-5 py-3 text-sm">Add</button>
      </form>

      <div className="pp-panel overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="pp-table-head text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 font-semibold">Item</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="px-5 py-3 font-semibold">Stock</th>
              <th className="px-5 py-3 font-semibold">Available</th>
              <th className="px-5 py-3 font-semibold">Rate/Day</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => {
              const lowStock = item.available / Math.max(item.quantity, 1) < 0.25;
              return (
                <tr key={item.id} className="border-t border-[var(--pp-border)]">
                  <td className="px-5 py-4">
                    <p className="font-medium text-[var(--pp-text)]">{item.name}</p>
                    {item.notes && <p className="mt-1 text-xs text-[var(--pp-text-muted)]">{item.notes}</p>}
                  </td>
                  <td className="px-5 py-4 text-[var(--pp-text-muted)]">{item.category}</td>
                  <td className="px-5 py-4">{item.quantity}</td>
                  <td className={`px-5 py-4 ${lowStock ? "font-semibold pp-accent-text" : ""}`}>{item.available}</td>
                  <td className="px-5 py-4 font-medium pp-accent-text">{formatCurrency(item.pricePerDay)}</td>
                  <td className="px-5 py-4"><StatusBadge status={item.status} kind="inventory" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
