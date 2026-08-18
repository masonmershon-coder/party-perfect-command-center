import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadMatterOrchestrationSnapshot } from "@/lib/matter-orchestration";
import { kituwaStoreMode } from "@/lib/kituwa/store";
import { matterRecordsStoreMode } from "@/lib/matter/records-store";
import type { HealthMetricValue } from "@/lib/matter/kituwa-contract-types";
import type { KituwaState } from "@/lib/kituwa/types";

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function metric(
  value: string,
  source: string,
  opts: Partial<HealthMetricValue> = {},
): HealthMetricValue {
  const observed = opts.observed_at || new Date().toISOString();
  return {
    value,
    source,
    observed_at: observed,
    last_success_at: opts.last_success_at ?? null,
    stale_after: opts.stale_after ?? null,
    status: opts.status || "unknown",
    reason: opts.reason ?? null,
  };
}

function staleStatus(iso: string | null, maxMs: number): HealthMetricValue["status"] {
  if (!iso) return "unknown";
  const age = Date.now() - Date.parse(iso);
  if (Number.isNaN(age)) return "unknown";
  if (age > maxMs) return "stale";
  return "ok";
}

export function kituwaBrainHealth(state: KituwaState) {
  const snap = loadMatterOrchestrationSnapshot();
  const observed = new Date().toISOString();
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

  const storeMode = kituwaStoreMode();
  const recordsMode = matterRecordsStoreMode();
  const hbStatus = staleStatus(lastHeartbeat, 60 * 60 * 1000);
  const syncStatus = staleStatus(sync.last_successful_sync || null, 24 * 60 * 60 * 1000);

  return {
    matter,
    brain: snap.ok ? "Connected" : "UNKNOWN",
    memory: storeMode === "ephemeral" ? "degraded" : "Available",
    storeMode,
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
    storage: storeMode === "ephemeral" ? "degraded" : "connected",
    localMac: localFresh == null ? "UNKNOWN" : localFresh ? "connected" : "offline",
    policy: snap.ok ? snap.policy.version : "UNKNOWN",
    note: snap.ok
      ? "Worker availability is probe+heartbeat, never asserted. Stale heartbeats count as unavailable."
      : snap.error,
    metrics: {
      web_app: metric("reachable", "kituwa.app", { status: "ok", observed_at: observed }),
      matter_orchestrator: metric(matter, "AI-HANDOFF/matter + matter-registry.mjs", {
        status: matter === "ONLINE" ? "ok" : matter === "DEGRADED" ? "degraded" : matter === "OFFLINE" ? "unavailable" : "unknown",
        observed_at: snap.ok ? snap.generated_at : observed,
        reason: snap.ok ? null : snap.error || "snapshot missing",
      }),
      worker_registry: metric(
        `${fresh.length} fresh / ${workers.length} registered`,
        "WORKER_REGISTRY.json",
        {
          status: workers.length === 0 ? "unavailable" : fresh.length ? "ok" : "stale",
          last_success_at: lastHeartbeat,
          stale_after: lastHeartbeat,
          reason: fresh.length ? null : "No worker with a fresh heartbeat",
        },
      ),
      last_heartbeat: metric(lastHeartbeat || "none", "WORKER_REGISTRY.json last_heartbeat", {
        status: hbStatus,
        last_success_at: lastHeartbeat,
        stale_after: lastHeartbeat,
        reason: hbStatus === "stale" ? "Heartbeat older than 60 minutes" : null,
      }),
      brain_sync: metric(sync.last_successful_sync || "none", "BRAIN_SYNC_STATE.json", {
        status: sync.last_successful_sync ? syncStatus : "unknown",
        last_success_at: sync.last_successful_sync || null,
        reason: sync.last_successful_sync ? null : "Automatic brain sync is not certified running",
      }),
      task_storage: metric(String(storeMode), "durable-json kituwa/state.json", {
        status: storeMode === "ephemeral" ? "degraded" : storeMode === "memory" ? "ok" : "ok",
      }),
      records_storage: metric(String(recordsMode), "durable-json kituwa/records-v2.json", {
        status: recordsMode === "ephemeral" ? "degraded" : "ok",
      }),
      supabase_ai_core: metric("not wired into Kituwa Alpha", "not configured", {
        status: "unavailable",
        reason: "Kituwa uses Blob/Redis durable JSON, not a live ai_core query from this host",
      }),
      mac_runtime: metric(
        localFresh == null ? "UNKNOWN" : localFresh ? "connected" : "offline",
        "POST /api/kituwa/worker/heartbeat",
        {
          status: localFresh == null ? "unknown" : localFresh ? "ok" : "unavailable",
          last_success_at: localPulse?.at || null,
          reason: localFresh == null ? "No Kituwa worker heartbeat received" : null,
        },
      ),
      cost: metric("UNKNOWN", "no ledger wired", {
        status: "unknown",
        reason: "Never show $0 when spend is unknown",
      }),
      api_budget: metric("UNKNOWN", "no ledger wired", { status: "unknown" }),
      por_square: metric("not this product", "Party Perfect isolation", {
        status: "unavailable",
        reason: "kituwa.app does not expose POR or Square APIs",
      }),
      queue: metric("unavailable", "Matter dispatch runtime", {
        status: "unavailable",
        reason: "Claude/Matter owns live dispatch. UI will not fake a queue.",
      }),
    },
    registryWorkers: workers.map((w) => ({
      worker_id: w.worker_id,
      provider: w.provider,
      product: w.product,
      model: w.model,
      version: w.version,
      available: w.available,
      heartbeat_fresh: w.heartbeat_fresh,
      last_heartbeat: w.last_heartbeat,
      cost_class: w.cost_class,
      permissions: w.permissions,
    })),
  };
}
