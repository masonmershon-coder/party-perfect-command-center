"use client";

import { formatTime } from "@/lib/ui";

export function LiveMikeStatus({
  enabled,
  checking,
  lastCheckedAt,
}: {
  enabled: boolean;
  checking: boolean;
  lastCheckedAt: string | null;
}) {
  if (!enabled) return null;

  return (
    <div className="hidden items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-panel)] px-3 py-2 text-xs sm:flex">
      <span className="text-base leading-none">📱</span>
      <div>
        <p className="font-medium text-[var(--pp-text)]">Mike · Operations Manager</p>
        <p className="text-[10px] text-[var(--pp-text-muted)]">
          {checking
            ? "Checking emails & comments…"
            : lastCheckedAt
              ? `Last scan ${formatTime(lastCheckedAt)}`
              : "Background watch active"}
        </p>
      </div>
      {checking && (
        <span className="h-2 w-2 rounded-full bg-[var(--pp-accent)] pp-live-pulse-dot" />
      )}
    </div>
  );
}
