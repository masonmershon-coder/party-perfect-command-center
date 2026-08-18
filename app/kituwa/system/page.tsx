"use client";

import { useEffect, useState } from "react";
import { KituwaNav } from "../components/kituwa-nav";

type Health = {
  metrics?: Record<string, { value: string; source: string; status: string; reason: string | null }>;
  registryWorkers?: Array<{ worker_id: string; provider: string | null; heartbeat_fresh: boolean }>;
};

export default function SystemPage() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    void fetch("/api/kituwa/state").then(async (res) => {
      const data = await res.json();
      setHealth(data.health);
    });
  }, []);

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">System</h1>
        </div>
      </header>
      <KituwaNav />
      <section className="kituwa-health">
        {health?.metrics
          ? Object.entries(health.metrics).map(([k, m]) => (
              <div key={k} className="kituwa-metric">
                <dt>{k}</dt>
                <dd>{m.value} · {m.status} · {m.source}</dd>
              </div>
            ))
          : null}
      </section>
      <section>
        <h2 className="kituwa-section-title">Worker registry</h2>
        <ul className="kituwa-rejected">
          {(health?.registryWorkers || []).map((w) => (
            <li key={w.worker_id}>
              {w.worker_id} · {w.provider || "unknown"} · {w.heartbeat_fresh ? "fresh" : "stale"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
