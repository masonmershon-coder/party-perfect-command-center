"use client";

import { useEffect, useState } from "react";

type Overview = {
  punchReady?: boolean;
  payrollReady?: boolean;
  whoIsWorking?: unknown[];
  exceptions?: unknown[];
};

export function TimePayrollStatusCard({ onOpen }: { onOpen?: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "error" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/time/admin/overview", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setState("denied");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const json = (await res.json()) as Overview;
        if (!cancelled) {
          setData(json);
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
            Time & Payroll
          </p>
          {state === "loading" ? (
            <p className="mt-1 text-sm text-[var(--pp-text-muted)]">Loading timekeeping…</p>
          ) : state === "error" ? (
            <p className="mt-1 text-sm text-amber-700">Timekeeping snapshot unavailable.</p>
          ) : (
            <p className="mt-2 text-sm">
              Working: {data?.whoIsWorking?.length ?? 0}
              {" · "}
              Exceptions: {data?.exceptions?.length ?? 0}
              {" · "}
              Punches: open (evidence + Shelly review signals)
            </p>
          )}
        </div>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="text-xs font-semibold underline underline-offset-2">
            Open Time & Payroll
          </button>
        ) : null}
      </div>
    </div>
  );
}
