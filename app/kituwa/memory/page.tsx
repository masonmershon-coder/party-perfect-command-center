"use client";

import { useEffect, useState } from "react";
import { KituwaNav } from "../components/kituwa-nav";

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
