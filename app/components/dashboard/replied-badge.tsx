"use client";

import { formatTime } from "@/lib/ui";

export function RepliedBadge({ repliedAt }: { repliedAt?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600">
      <span aria-hidden>✓</span>
      <span>Replied</span>
      {repliedAt && (
        <span className="font-normal normal-case opacity-80">
          {formatTime(repliedAt)}
        </span>
      )}
    </span>
  );
}

export function MarkRepliedButton({
  disabled,
  onClick,
  compact,
}: {
  disabled?: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-lg border border-emerald-500/50 bg-emerald-500/10 font-medium text-emerald-600 transition hover:bg-emerald-500/20 disabled:opacity-50 ${
        compact ? "px-3 py-2 text-xs" : "px-3 py-2.5 text-sm"
      }`}
    >
      ✓ Mark as Replied
    </button>
  );
}
