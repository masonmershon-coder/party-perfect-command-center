"use client";

import { fetchPorSyncHealth } from "@/lib/client-api";
import type { PorSyncHealthReport } from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useEffect, useState } from "react";

export function PorSyncHealthPanel() {
  const [health, setHealth] = useState<PorSyncHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPorSyncHealth()
      .then((report) => {
        if (!cancelled) setHealth(report);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load sync health.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-6 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-panel)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
            Owner
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--pp-text)]">
            POR sync health
          </h3>
          <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
            Last successful ENTERPRISE push per target. Window is 20 minutes
            (agent runs ~every 10). App-side only — POR stays read-only.
          </p>
        </div>
        {health ? (
          <span
            className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              health.overdueCount > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            }`}
          >
            {health.overdueCount > 0
              ? `${health.overdueCount} overdue`
              : "On window"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      ) : !health ? (
        <p className="mt-3 text-xs text-[var(--pp-text-muted)]">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {health.targets.map((target) => (
            <div
              key={target.id}
              className={`rounded-xl border px-3 py-3 ${
                !target.configured
                  ? "border-[var(--pp-border)] bg-[var(--pp-bg)]"
                  : target.overdue
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-emerald-500/20 bg-[var(--pp-bg)]"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                {target.label}
              </p>
              <p className="mt-1 font-mono text-[10px] text-[var(--pp-text-muted)]">
                {target.path}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--pp-text)]">
                {!target.configured
                  ? "Not configured"
                  : target.ageLabel ?? "Never pushed"}
              </p>
              {target.lastSuccessAt ? (
                <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                  Last OK {formatTime(target.lastSuccessAt)}
                </p>
              ) : null}
              {target.lastError ? (
                <p className="mt-2 text-[10px] text-red-600">
                  Last error
                  {target.lastErrorAt
                    ? ` ${formatTime(target.lastErrorAt)}`
                    : ""}
                  : {target.lastError}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
