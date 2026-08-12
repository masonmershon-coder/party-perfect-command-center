"use client";

import type { PorSyncMeta } from "@/lib/types";
import { formatTime } from "@/lib/ui";

export function PorFreshnessBadge({
  porMeta,
}: {
  porMeta: PorSyncMeta | null | undefined;
}) {
  if (!porMeta?.present) {
    return (
      <span className="rounded-md border border-[var(--pp-border)] bg-[var(--pp-accent-muted)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">
        No sync
      </span>
    );
  }
  if (porMeta.veryStale) {
    return (
      <span className="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
        Stale
      </span>
    );
  }
  if (porMeta.stale) {
    return (
      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200">
        Stale
      </span>
    );
  }
  return (
    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
      Live
    </span>
  );
}

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

  const ago = porMeta.ageLabel ?? "sync time unknown";
  const clock = porMeta.syncedAt ? formatTime(porMeta.syncedAt) : null;

  if (porMeta.veryStale) {
    return (
      <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-900 dark:text-red-100">
        <span className="font-semibold">POR sync stale — data may be outdated</span>
        {" · "}
        {label} read-only mirror · {ago}
        {clock ? ` (${clock})` : ""}
        {porMeta.sourceHost ? ` · ${porMeta.sourceHost}` : ""}
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
      <span className="mr-2 inline-flex align-middle">
        <PorFreshnessBadge porMeta={porMeta} />
      </span>
      {porMeta.stale ? "POR sync stale" : "Live from Point of Rental"} · {label}{" "}
      read-only mirror · {ago}
      {clock ? ` (${clock})` : ""}
      {porMeta.sourceHost ? ` · ${porMeta.sourceHost}` : ""}
    </div>
  );
}
