"use client";

import { useEffect, useState } from "react";

type SummaryCard = {
  meteredToday?: { display: string };
  fixedMonthly?: { display: string };
  projectedMonthEnd?: { display: string };
  activeAlertCount?: number;
  dataFreshness?: { label: string; stale: boolean };
  unattributedUsage?: { display: string };
};

export function AiCostStatusCard({ onOpen }: { onOpen?: () => void }) {
  const [summary, setSummary] = useState<SummaryCard | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "error" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-cost/summary", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setState("denied");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const data = (await res.json()) as SummaryCard;
        if (!cancelled) {
          setSummary(data);
          setState("ok");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "denied") return null;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-panel)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
            AI Cost & Usage
          </p>
          {state === "loading" ? (
            <p className="mt-1 text-sm text-[var(--pp-text-muted)]">Loading owner cost snapshot…</p>
          ) : state === "error" ? (
            <p className="mt-1 text-sm text-amber-700">Cost snapshot unavailable. Not $0.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Today metered: </span>
                {summary?.meteredToday?.display ?? "UNKNOWN"}
              </p>
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Fixed monthly: </span>
                {summary?.fixedMonthly?.display ?? "UNKNOWN"}
              </p>
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Projected month-end: </span>
                {summary?.projectedMonthEnd?.display ?? "UNKNOWN"}
              </p>
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Budget: </span>
                not configured
              </p>
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Alerts: </span>
                {summary?.activeAlertCount ?? 0}
              </p>
              <p className="text-sm">
                <span className="text-[var(--pp-text-muted)]">Freshness: </span>
                {summary?.dataFreshness?.label ?? "UNAVAILABLE"}
              </p>
            </div>
          )}
        </div>
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-semibold underline underline-offset-2"
          >
            Open AI Cost & Usage
          </button>
        ) : null}
      </div>
    </div>
  );
}
