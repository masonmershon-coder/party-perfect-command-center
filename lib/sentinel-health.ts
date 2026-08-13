/**
 * Sentinel monitoring status for Command Center.
 *
 * Never report HEALTHY without independent watchdog evidence.
 * Collector self-report (sentinel-health.json) is NOT sufficient.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type SentinelMonitorStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "unknown";

export type SentinelHealthCard = {
  status: SentinelMonitorStatus;
  label: string;
  reason: string;
  watchdogAt: string | null;
  watchdogAgeMs: number | null;
  collectorLastScan: string | null;
  banner: string | null;
  /** Employees see status+banner only. Owner may see extra. */
  employeeSafe: true;
};

const WATCHDOG_STALE_MS = 15 * 60 * 1000;

function handoffFile(...parts: string[]) {
  return path.join(process.cwd(), "AI-HANDOFF", ...parts);
}

type WatchdogFile = {
  watchdog_at?: string;
  status?: string;
  component?: string;
};

type CollectorHealthFile = {
  last_scan?: string;
  detector_errors?: unknown[];
  emitted?: number;
};

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readSentinelHealthCard(): Promise<SentinelHealthCard> {
  const watchdog = await readJsonFile<WatchdogFile>(
    handoffFile("sentinel", "watchdog-health.json"),
  );
  const collector = await readJsonFile<CollectorHealthFile>(
    handoffFile("sentinel", "sentinel-health.json"),
  );

  const collectorLastScan =
    typeof collector?.last_scan === "string" ? collector.last_scan : null;

  if (!watchdog || typeof watchdog.watchdog_at !== "string") {
    return {
      status: "unknown",
      label: "Security monitoring unknown",
      reason: "watchdog_evidence_missing",
      watchdogAt: null,
      watchdogAgeMs: null,
      collectorLastScan,
      banner:
        "SECURITY MONITORING DEGRADED — Command Center remains available.",
      employeeSafe: true,
    };
  }

  const watchdogAt = watchdog.watchdog_at;
  const ageMs = Date.now() - Date.parse(watchdogAt);
  const watchdogAgeMs = Number.isFinite(ageMs) ? ageMs : null;

  if (watchdogAgeMs == null || watchdogAgeMs > WATCHDOG_STALE_MS) {
    return {
      status: "degraded",
      label: "Security monitoring degraded",
      reason: "watchdog_stale",
      watchdogAt,
      watchdogAgeMs,
      collectorLastScan,
      banner:
        "SECURITY MONITORING DEGRADED — Command Center remains available.",
      employeeSafe: true,
    };
  }

  const reported = String(watchdog.status || "").toLowerCase();
  if (reported === "offline") {
    return {
      status: "offline",
      label: "Security monitoring offline",
      reason: "watchdog_offline",
      watchdogAt,
      watchdogAgeMs,
      collectorLastScan,
      banner:
        "SECURITY MONITORING OFFLINE — Command Center remains available.",
      employeeSafe: true,
    };
  }

  if (reported === "healthy" && watchdog.component === "watchdog") {
    return {
      status: "healthy",
      label: "Security monitoring healthy",
      reason: "watchdog_fresh",
      watchdogAt,
      watchdogAgeMs,
      collectorLastScan,
      banner: null,
      employeeSafe: true,
    };
  }

  return {
    status: "degraded",
    label: "Security monitoring degraded",
    reason: reported === "degraded" ? "watchdog_degraded" : "watchdog_unproven",
    watchdogAt,
    watchdogAgeMs,
    collectorLastScan,
    banner: "SECURITY MONITORING DEGRADED — Command Center remains available.",
    employeeSafe: true,
  };
}
