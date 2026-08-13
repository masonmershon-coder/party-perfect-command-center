"use client";

import { useEffect, useState } from "react";

type EmployeeHealth = {
  status: "healthy" | "degraded" | "offline" | "unknown";
  label: string;
  banner: string | null;
};

const STATUS_CLASS: Record<EmployeeHealth["status"], string> = {
  healthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  degraded: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  offline: "border-red-500/40 bg-red-500/10 text-red-700",
  unknown: "border-amber-500/40 bg-amber-500/10 text-amber-800",
};

export function SecurityHealthCard({
  onOpenInbox,
}: {
  onOpenInbox?: () => void;
}) {
  const [card, setCard] = useState<EmployeeHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sentinel/health", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as EmployeeHealth;
      })
      .then((data) => {
        if (!cancelled && data?.status) setCard(data);
      })
      .catch(() => {
        if (!cancelled) {
          setCard({
            status: "unknown",
            label: "Security monitoring unknown",
            banner:
              "SECURITY MONITORING DEGRADED — Command Center remains available.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = card?.status ?? "unknown";
  const label = card?.label ?? "Security monitoring";
  const banner = card?.banner ?? null;

  return (
    <div className="mb-4 space-y-3">
      {banner ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900"
        >
          {banner}
        </div>
      ) : null}
      <div className={`rounded-2xl border px-4 py-4 ${STATUS_CLASS[status]}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">
          Security
        </p>
        <p className="mt-1 text-base font-semibold">{label}</p>
        <p className="mt-1 text-xs opacity-80">
          Monitoring only. Does not change quotes, jobs, or warehouse work.
        </p>
        {onOpenInbox ? (
          <button
            type="button"
            onClick={onOpenInbox}
            className="mt-3 text-xs font-semibold underline underline-offset-2"
          >
            Open Security Inbox
          </button>
        ) : null}
      </div>
    </div>
  );
}
