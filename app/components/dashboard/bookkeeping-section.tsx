"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { PorSyncBanner } from "@/app/components/dashboard/por-sync-banner";
import { StatusBadge } from "@/app/components/status-badge";
import type { BookkeepingEntry, PorSyncMeta } from "@/lib/types";
import { formatCurrency } from "@/lib/ui";
import { FormEvent, useState } from "react";

export function BookkeepingSection({
  entries,
  source = "local",
  porMeta = null,
  onCreateEntry,
}: {
  entries: BookkeepingEntry[];
  source?: "por" | "local";
  porMeta?: PorSyncMeta | null;
  onCreateEntry: (input: {
    vendor: string;
    description: string;
    amount: number;
    dueDate?: string;
  }) => Promise<void>;
}) {
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const readOnly = source === "por";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setLoading(true);
    try {
      await onCreateEntry({ vendor, description, amount, dueDate: dueDate || undefined });
      setVendor("");
      setDescription("");
      setAmount(0);
      setDueDate("");
    } finally {
      setLoading(false);
    }
  }

  const totalPending = entries
    .filter((e) => e.status === "pending" || e.status === "overdue")
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Bookkeeping"
        description={
          readOnly
            ? "AR aging and payment summaries from Point of Rental. No payments are taken here."
            : "Track vendor bills, payments, and outstanding balances."
        }
        action={
          <div className="pp-stat-card rounded-xl px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
              {readOnly ? "AR Open" : "Outstanding"}
            </p>
            <p className="text-xl font-semibold pp-accent-text">{formatCurrency(totalPending)}</p>
          </div>
        }
      />

      <PorSyncBanner source={source} porMeta={porMeta} label="bookkeeping" />

      {!readOnly ? (
        <form onSubmit={handleSubmit} className="pp-panel mb-8 grid gap-3 rounded-2xl p-5 md:grid-cols-[1fr_1fr_0.5fr_0.5fr_auto]">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="pp-input px-4 py-3 text-sm" required />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="pp-input px-4 py-3 text-sm" required />
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" className="pp-input px-4 py-3 text-sm" required />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="pp-input px-4 py-3 text-sm" />
          <button type="submit" disabled={loading} className="pp-btn-primary w-full px-5 py-3 text-sm md:w-auto">Add Entry</button>
        </form>
      ) : null}

      <div className="pp-panel overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="pp-table-head text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 font-semibold">Vendor</th>
              <th className="px-5 py-3 font-semibold">Description</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Due</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--pp-border)]">
                <td className="px-5 py-4 font-medium text-[var(--pp-text)]">{entry.vendor}</td>
                <td className="px-5 py-4 text-[var(--pp-text-muted)]">{entry.description}</td>
                <td className="px-5 py-4 font-medium pp-accent-text">{formatCurrency(entry.amount)}</td>
                <td className="px-5 py-4 text-[var(--pp-text-muted)]">{entry.dueDate ?? "—"}</td>
                <td className="px-5 py-4"><StatusBadge status={entry.status} kind="bookkeeping" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
