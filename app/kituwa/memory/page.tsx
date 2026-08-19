"use client";

import { useEffect, useState } from "react";
import { KituwaNav } from "../components/kituwa-nav";
import { MatterFloorScene } from "../components/matter-floor-scene";

export default function MemoryPage() {
  const [projects, setProjects] = useState<Array<{ project_id: string; name: string }>>([]);
  useEffect(() => {
    void fetch("/api/kituwa/projects").then(async (res) => {
      const data = await res.json();
      setProjects(data.projects || []);
    });
  }, []);

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Memory archives</h1>
        </div>
      </header>
      <KituwaNav />
      <div className="matter-memory-room" style={{ ["--floor-accent" as string]: "#c9b37a" }}>
        <MatterFloorScene floor="memory" lit busy={false} blocked={false} workerCount={2} tall />
      </div>
      <p className="kituwa-using">
        Durable project memory from Blob-backed records. No browser storage authority.
      </p>
      <ul className="kituwa-task-list">
        {projects.map((p) => (
          <li key={p.project_id}>{p.name}</li>
        ))}
      </ul>
    </main>
  );
}
