"use client";

import { useCallback, useEffect, useState } from "react";

type WorkerRow = {
  worker_id: string;
  provider: string | null;
  product: string | null;
  version: string | null;
  available: boolean;
  heartbeat_fresh: boolean;
  heartbeat_age_minutes: number | null;
  last_heartbeat: string | null;
  policy_synced: boolean;
  policy_version_ack: string | null;
  score: number | null;
  score_samples: number;
  score_reason: string | null;
  latency_ms: number | null;
  capabilities: Record<string, { level?: unknown; source?: string } | unknown>;
  limitations: string[];
};

type Snap = {
  generated_at: string;
  policy: { version: string; principle?: string; policy_id?: string };
  counts: {
    workers_total: number;
    workers_available: number;
    workers_policy_synced: number;
    workers_heartbeat_fresh: number;
    policy_acks: number;
    routing_decisions: number;
    routing_blocked: number;
    capability_changes: number;
    outcomes: number;
    updates_available: number;
  };
  workers: WorkerRow[];
  recent_routing: Array<Record<string, unknown>>;
  recent_acks: Array<Record<string, unknown>>;
  recent_outcomes: Array<Record<string, unknown>>;
  recent_watch: Array<Record<string, unknown>>;
  business_agents: Record<string, { agent_id?: string; domain?: string; notes?: string }>;
};

function pill(ok: boolean, yes: string, no: string) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700"
      }`}
    >
      {ok ? yes : no}
    </span>
  );
}

export function MatterControlSection() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/matter/orchestration", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setSnap(null);
        return;
      }
      setSnap(data as Snap);
    } catch {
      setError("Network error");
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snap) {
    return (
      <div className="p-6 text-sm text-[var(--pp-text-muted)]">
        Loading Matter control plane…
      </div>
    );
  }

  if (error && !snap) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!snap) return null;
  const c = snap.counts;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--pp-text)]">
          Matter Control
        </h2>
        <p className="max-w-3xl text-sm text-[var(--pp-text-muted)]">
          Provider-neutral orchestration. Workers are replaceable; Matter owns
          the jobs. Status below is read from durable files — availability is
          probed, never hard-coded.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pp-text-muted)]">
          <span>Policy {snap.policy.version}</span>
          <span>·</span>
          <span>Snapshot {new Date(snap.generated_at).toLocaleString()}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-2 rounded border border-[var(--pp-border)] px-2 py-0.5 text-[var(--pp-text)]"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Workers online", `${c.workers_available}/${c.workers_total}`],
          ["Policy synced", `${c.workers_policy_synced}/${c.workers_total}`],
          ["Fresh heartbeats", `${c.workers_heartbeat_fresh}/${c.workers_total}`],
          ["Updates available", String(c.updates_available)],
          ["Routing decisions", String(c.routing_decisions)],
          ["Blocked routes", String(c.routing_blocked)],
          ["Policy acks", String(c.policy_acks)],
          ["Outcomes", String(c.outcomes)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-3"
          >
            <div className="text-[11px] uppercase tracking-wide text-[var(--pp-text-muted)]">
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">
          Workers
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--pp-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--pp-accent-muted)] text-[11px] uppercase tracking-wide text-[var(--pp-text-muted)]">
              <tr>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Avail</th>
                <th className="px-3 py-2">Heartbeat</th>
                <th className="px-3 py-2">Policy</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {snap.workers.map((w) => (
                <tr
                  key={w.worker_id}
                  className="border-t border-[var(--pp-border)]"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{w.worker_id}</div>
                    <div className="text-xs text-[var(--pp-text-muted)]">
                      {w.provider || "—"} · {w.version || "no version"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {pill(w.available, "Yes", "No")}
                    {w.latency_ms != null && (
                      <div className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                        {w.latency_ms}ms
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {pill(w.heartbeat_fresh, "Fresh", "Stale")}
                    <div className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                      {w.last_heartbeat
                        ? `${w.heartbeat_age_minutes ?? "?"}m ago`
                        : "never"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {pill(w.policy_synced, "Synced", "Stale")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {w.score == null
                      ? `n/a (${w.score_samples})`
                      : w.score}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--pp-text-muted)]">
                    {Object.entries(w.capabilities)
                      .map(([k, v]) => {
                        const level =
                          v && typeof v === "object" && "level" in v
                            ? (v as { level: unknown }).level
                            : v;
                        return `${k}:${String(level)}`;
                      })
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">
            Business agents (stable roles)
          </h3>
          <ul className="space-y-2">
            {Object.values(snap.business_agents).map((a) => (
              <li
                key={a.agent_id || a.domain}
                className="rounded-lg border border-[var(--pp-border)] px-3 py-2 text-sm"
              >
                <div className="font-medium">{a.agent_id}</div>
                <div className="text-xs text-[var(--pp-text-muted)]">
                  {a.domain} — {a.notes}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">
            Recent routing (audited)
          </h3>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
            {snap.recent_routing.length === 0 && (
              <li className="text-[var(--pp-text-muted)]">No routing decisions yet.</li>
            )}
            {snap.recent_routing.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-[var(--pp-border)] px-3 py-2"
              >
                <div>
                  {String(r.task_id || "—")} → primary{" "}
                  <strong>{String(r.primary || "none")}</strong>
                  {r.verifier ? ` · verifier ${String(r.verifier)}` : ""}
                  {r.blocked ? " · BLOCKED" : ""}
                </div>
                <div className="text-[var(--pp-text-muted)]">
                  {String(r.at || "")} · policy {String(r.policy_version || "")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error && (
        <p className="text-sm text-amber-600">Refresh warning: {error}</p>
      )}
    </div>
  );
}
