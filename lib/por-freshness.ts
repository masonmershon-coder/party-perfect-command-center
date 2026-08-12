import type { PorFreshness, PorSyncMeta } from "./types";

/** Amber STALE — snapshot older than ~two ENTERPRISE cycles (agent is ~10 min). */
export const POR_SYNC_STALE_MS = 20 * 60 * 1000;

/** Red banner — snapshot older than an hour; treat as possibly down. */
export const POR_SYNC_VERY_STALE_MS = 60 * 60 * 1000;

export function ageMsFromSyncedAt(
  syncedAt: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!syncedAt) return null;
  const ageMs = now - new Date(syncedAt).getTime();
  return Number.isFinite(ageMs) ? ageMs : null;
}

export function porFreshnessFromAge(
  ageMs: number | null,
  present: boolean,
): PorFreshness {
  if (!present || ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) {
    return "missing";
  }
  if (ageMs > POR_SYNC_VERY_STALE_MS) return "very_stale";
  if (ageMs > POR_SYNC_STALE_MS) return "stale";
  return "fresh";
}

/** e.g. "synced 8 min ago" / "synced just now" */
export function formatSyncedAgo(ageMs: number | null): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) {
    return "sync time unknown";
  }
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "synced just now";
  if (mins === 1) return "synced 1 min ago";
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) {
    return rem ? `synced ${hours}h ${rem}m ago` : `synced ${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "synced 1d ago" : `synced ${days}d ago`;
}

export function ageMinutes(ageMs: number | null): number | null {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return null;
  return Math.max(0, Math.floor(ageMs / 60_000));
}

export function missingPorSyncMeta(): PorSyncMeta {
  return {
    present: false,
    stale: true,
    veryStale: true,
    freshness: "missing",
    syncedAt: null,
    ageMs: null,
    ageLabel: null,
    sourceHost: null,
  };
}

export function buildPorSyncMeta(input: {
  syncedAt: string | null;
  sourceHost?: string | null;
  now?: number;
}): PorSyncMeta {
  const syncedAt = input.syncedAt;
  if (!syncedAt) return missingPorSyncMeta();

  const ageMs = ageMsFromSyncedAt(syncedAt, input.now);
  const freshness = porFreshnessFromAge(ageMs, true);
  return {
    present: true,
    stale: freshness === "stale" || freshness === "very_stale",
    veryStale: freshness === "very_stale",
    freshness,
    syncedAt,
    ageMs,
    ageLabel: formatSyncedAgo(ageMs),
    sourceHost: input.sourceHost ?? null,
  };
}
