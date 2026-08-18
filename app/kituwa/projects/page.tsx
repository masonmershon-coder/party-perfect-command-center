"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KituwaNav } from "../components/kituwa-nav";
import type { ProjectRecord } from "@/lib/matter/kituwa-contract-types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  useEffect(() => {
    void fetch("/api/kituwa/projects", { cache: "no-store" }).then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/kituwa";
        return;
      }
      const data = await res.json();
      setProjects(data.projects || []);
    });
  }, []);

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Projects</h1>
        </div>
      </header>
      <KituwaNav />
      <ul className="kituwa-task-list">
        {projects.map((p) => (
          <li key={p.project_id}>
            <Link href={`/projects/${p.project_id}`}>
              <strong>{p.name}</strong>
              <span>{p.confidence}</span>
              <small>{p.task_ids.length} task(s)</small>
            </Link>
          </li>
        ))}
      </ul>
      {!projects.length ? <p className="kituwa-using">Projects appear when Matter pins durable work.</p> : null}
    </main>
  );
}
