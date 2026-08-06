"use client";

import type { LiveNotification } from "@/lib/types";
import { useEffect } from "react";

export function LiveNotifications({
  notifications,
  onDismiss,
}: {
  notifications: LiveNotification[];
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map((notification) =>
      window.setTimeout(() => onDismiss(notification.id), 8000),
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed inset-x-4 top-[4.5rem] z-50 mx-auto flex w-auto max-w-sm flex-col gap-2 lg:inset-x-auto lg:right-4 lg:left-auto">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="pp-live-toast flex items-start gap-3 rounded-xl border border-[var(--pp-accent)]/30 bg-[var(--pp-panel)] px-4 py-3 shadow-lg"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pp-accent-soft)] text-sm">
            {notification.kind === "emails"
              ? "✉"
              : notification.kind === "facebook"
                ? "f"
                : notification.kind === "instagram"
                  ? "◎"
                  : "✓"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
              Mike spotted new activity
            </p>
            <p className="mt-0.5 text-sm font-medium text-[var(--pp-text)]">
              {notification.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-[var(--pp-text-muted)] hover:text-[var(--pp-text)]"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
