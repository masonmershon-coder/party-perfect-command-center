"use client";

import { APP_RELEASE_LABEL, APP_VERSION } from "@/lib/app-version";

/** Small fixed corner stamp so Mike always sees the live build. */
export function VersionBadge() {
  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-30 select-none rounded-md border border-[var(--pp-border)] bg-[var(--pp-panel)]/90 px-2 py-1 backdrop-blur-sm"
      title={`Party Perfect Command Center ${APP_RELEASE_LABEL}`}
      aria-label={`App version ${APP_VERSION}`}
    >
      <p className="font-mono text-[10px] leading-none tracking-wide text-[var(--pp-text-muted)]">
        {APP_RELEASE_LABEL}
      </p>
    </div>
  );
}
