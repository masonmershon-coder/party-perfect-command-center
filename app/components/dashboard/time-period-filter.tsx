"use client";

import {
  DEFAULT_TIME_PERIOD,
  getTimePeriodLabel,
  TIME_PERIOD_OPTIONS,
  type TimePeriod,
} from "@/lib/time-filter";

export function TimePeriodFilter({
  value = DEFAULT_TIME_PERIOD,
  onChange,
  itemCount,
  itemLabel = "items",
}: {
  value?: TimePeriod;
  onChange: (period: TimePeriod) => void;
  itemCount?: number;
  itemLabel?: string;
}) {
  return (
    <div className="pp-panel mb-6 rounded-2xl border border-[var(--pp-border)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            Time period
          </p>
          <p className="mt-1 text-sm text-[var(--pp-text)]">
            Showing{" "}
            <span className="font-semibold pp-accent-text">
              {getTimePeriodLabel(value)}
            </span>
            {itemCount !== undefined && (
              <span className="text-[var(--pp-text-muted)]">
                {" "}
                · {itemCount} {itemLabel}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIME_PERIOD_OPTIONS.map((option) => {
          const isActive = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                isActive
                  ? "bg-[var(--pp-accent)] text-white shadow-sm"
                  : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)] hover:pp-accent-text"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
