/**
 * Read-only Matter orchestration owner snapshot.
 * Persistence lives under AI-HANDOFF/matter — this module never invents online status.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const MATTER_DIR = path.join(process.cwd(), "AI-HANDOFF", "matter");

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readLines(file: string): Record<string, unknown>[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row != null);
}

type Cap = { level?: unknown; source?: string } | unknown;

type WorkerRec = {
  worker_id: string;
  provider?: string | null;
  product?: string | null;
  model?: string | null;
  version?: string | null;
  available?: boolean;
  last_probe?: string | null;
  last_heartbeat?: string | null;
  latency_ms?: number | null;
  policy_version_ack?: string | null;
  capabilities?: Record<string, Cap>;
  permissions?: Record<string, boolean>;
  limitations?: string[];
  cost_class?: string | null;
};

export function loadMatterOrchestrationSnapshot() {
  const policyRaw = readJson<Record<string, unknown> | null>(
    path.join(MATTER_DIR, "MATTER_POLICY.json"),
    null,
  );
  if (!policyRaw) {
    return {
      ok: false as const,
      error: "MATTER_POLICY.json missing",
      path: MATTER_DIR,
    };
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(policyRaw))
    .digest("hex")
    .slice(0, 12);
  const semver = String(policyRaw.semver ?? "0.0.0");
  const policyVersion = `${semver}+${hash}`;
  const maxAgeMs =
    Number(policyRaw.heartbeat_max_age_minutes ?? 60) * 60_000;
  const minSamples = Number(policyRaw.min_samples_for_score ?? 5);

  const registry = readJson<{ workers?: Record<string, WorkerRec> }>(
    path.join(MATTER_DIR, "WORKER_REGISTRY.json"),
    { workers: {} },
  );
  const acks = readLines(path.join(MATTER_DIR, "POLICY_ACKS.jsonl"));
  const routes = readLines(path.join(MATTER_DIR, "ROUTING_DECISIONS.jsonl"));
  const outcomes = readLines(path.join(MATTER_DIR, "WORKER_OUTCOMES.jsonl"));
  const watch = readLines(path.join(MATTER_DIR, "CAPABILITY_WATCH.jsonl"));
  const business = readJson<{ agents?: Record<string, unknown> }>(
    path.join(MATTER_DIR, "BUSINESS_AGENTS.json"),
    { agents: {} },
  );

  const scoreFor = (workerId: string) => {
    const rows = outcomes.filter((r) => r.worker_id === workerId);
    const n = rows.length;
    if (n < minSamples) {
      return {
        score: null as number | null,
        samples: n,
        reason: `insufficient samples (${n} < ${minSamples})`,
      };
    }
    const good = rows.filter((r) => r.outcome === "verified_pass").length;
    const bad = rows.filter((r) =>
      ["failed", "rework", "rolled_back", "human_correction"].includes(
        String(r.outcome),
      ),
    ).length;
    return {
      score: Number(((good - bad) / n).toFixed(3)),
      samples: n,
      reason: null as string | null,
    };
  };

  const workers = Object.values(registry.workers ?? {})
    .sort((a, b) => (a.worker_id < b.worker_id ? -1 : 1))
    .map((w) => {
      const age = w.last_heartbeat
        ? Date.now() - Date.parse(w.last_heartbeat)
        : null;
      const s = scoreFor(w.worker_id);
      return {
        worker_id: w.worker_id,
        provider: w.provider ?? null,
        product: w.product ?? null,
        model: w.model ?? null,
        version: w.version ?? null,
        available: Boolean(w.available),
        last_probe: w.last_probe ?? null,
        last_heartbeat: w.last_heartbeat ?? null,
        heartbeat_age_minutes:
          age == null ? null : Math.round(age / 60_000),
        heartbeat_fresh: age != null && age <= maxAgeMs,
        latency_ms: w.latency_ms ?? null,
        policy_version_ack: w.policy_version_ack ?? null,
        policy_synced: w.policy_version_ack === policyVersion,
        score: s.score,
        score_samples: s.samples,
        score_reason: s.reason,
        capabilities: w.capabilities ?? {},
        permissions: w.permissions ?? {},
        limitations: w.limitations ?? [],
        cost_class: w.cost_class ?? null,
      };
    });

  const routing = routes.filter((r) => r.kind === "ROUTING_DECISION");

  return {
    ok: true as const,
    generated_at: new Date().toISOString(),
    source_dir: MATTER_DIR,
    policy: {
      policy_id: policyRaw.policy_id,
      version: policyVersion,
      semver,
      principle: policyRaw.principle,
      effective: policyRaw.effective,
    },
    workers,
    counts: {
      workers_total: workers.length,
      workers_available: workers.filter((w) => w.available).length,
      workers_policy_synced: workers.filter((w) => w.policy_synced).length,
      workers_heartbeat_fresh: workers.filter((w) => w.heartbeat_fresh)
        .length,
      policy_acks: acks.length,
      routing_decisions: routing.length,
      routing_blocked: routing.filter((r) => r.blocked).length,
      capability_changes: routes.filter(
        (r) => r.kind === "CAPABILITY_CHANGE_DETECTED",
      ).length,
      outcomes: outcomes.length,
      capability_watch_events: watch.length,
      updates_available: watch.filter(
        (w) => w.kind === "UPDATE_AVAILABLE" && !w.applied,
      ).length,
    },
    recent_routing: routing.slice(-10).reverse(),
    recent_acks: acks.slice(-10).reverse(),
    recent_outcomes: outcomes.slice(-10).reverse(),
    recent_watch: watch.slice(-10).reverse(),
    business_agents: business.agents ?? {},
  };
}
