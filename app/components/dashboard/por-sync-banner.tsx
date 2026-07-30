"use client";

import type { PorSyncMeta } from "@/lib/types";
import { formatTime } from "@/lib/ui";

export function PorSyncBanner({
  source,
  porMeta,
  label,
}: {
  source: "por" | "local";
  porMeta: PorSyncMeta | null;
  label: string;
}) {
  if (source !== "por" || !porMeta?.present) {
    return (
      <div className="mb-4 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-panel)] px-4 py-3 text-xs text-[var(--pp-text-muted)]">
        Showing local Command Center {label}. Live Point of Rental sync not
        connected yet.
      </div>
    );
  }

  return (
    <div
      className={`mb-4 rounded-xl border px-4 py-3 text-xs ${
        porMeta.stale
          ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          : "border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/40 text-[var(--pp-text)]"
      }`}
    >
      {porMeta.stale ? "POR sync stale" : "Live from Point of Rental"} ·{" "}
      {label} read-only mirror
      {porMeta.syncedAt ? ` · synced ${formatTime(porMeta.syncedAt)}` : ""}
      {porMeta.sourceHost ? ` · ${porMeta.sourceHost}` : ""}
    </div>
  );
}
