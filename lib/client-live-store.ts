const LIVE_MODE_KEY = "pp-live-mode";

export function readLiveModeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(LIVE_MODE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

export function writeLiveModeEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIVE_MODE_KEY, String(enabled));
  } catch {
    // ignore storage errors
  }
}

/** Live Mode poll — Redis snapshot only (IMAP/Meta sync via cron or explicit sync=1). */
export const LIVE_POLL_INTERVAL_MS = 180_000;

/** Sections that pull full payloads when Live Mode is on */
export const LIVE_REFRESH_SECTIONS = ["emails", "social", "tasks", "dashboard"] as const;
