import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadMatterOrchestrationSnapshot } from "@/lib/matter-orchestration";
import { kituwaStoreMode } from "@/lib/kituwa/store";
import type { KituwaState } from "@/lib/kituwa/types";

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function kituwaBrainHealth(state: KituwaState) {
  const snap = loadMatterOrchestrationSnapshot();
  const sync = readJson<{
    last_successful_sync?: string | null;
    last_sync_attempt?: string | null;
    errors?: unknown[];
  }>(path.join(process.cwd(), "AI-HANDOFF", "matter", "BRAIN_SYNC_STATE.json"), {});

  const workers = snap.ok ? snap.workers : [];
  const fresh = workers.filter((w) => w.heartbeat_fresh && w.available);
  const busy = state.tasks.filter((t) => t.state === "RUNNING").length;
  const stale = workers.filter((w) => !w.heartbeat_fresh || !w.available);
  const lastHeartbeat =
    workers
      .map((w) => w.last_heartbeat)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) || null;

  let matter: "ONLINE" | "DEGRADED" | "OFFLINE" | "UNKNOWN" = "UNKNOWN";
  if (!snap.ok) matter = "UNKNOWN";
  else if (fresh.length > 0) matter = "ONLINE";
  else if (workers.length > 0) matter = "DEGRADED";
  else matter = "OFFLINE";

  const localPulse = state.workerPulses
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const localFresh =
    localPulse && Date.now() - Date.parse(localPulse.at) < 15 * 60 * 1000
      ? localPulse.available
      : null;

  return {
    matter,
    brain: snap.ok ? "Connected" : "UNKNOWN",
    memory: kituwaStoreMode() === "ephemeral" ? "degraded" : "Available",
    storeMode: kituwaStoreMode(),
    workers: {
      available: fresh.length,
      busy,
      unavailable: stale.length,
      total: workers.length,
    },
    currentTask: state.matterStatus,
    verification: state.tasks.some((t) => t.category === "verification" && t.state !== "COMPLETE")
      ? "Pending"
      : state.tasks.length
        ? "None open"
        : "UNKNOWN",
    costToday: "UNKNOWN",
    apiBudget: "UNKNOWN",
    lastBrainSync: sync.last_successful_sync || null,
    lastHeartbeat,
    storage: kituwaStoreMode() === "ephemeral" ? "degraded" : "connected",
    localMac:
      localFresh == null ? "UNKNOWN" : localFresh ? "connected" : "offline",
    policy: snap.ok ? snap.policy.version : "UNKNOWN",
    note: snap.ok
      ? "Worker availability is probe+heartbeat, never asserted. Stale heartbeats count as unavailable."
      : snap.error,
  };
}
