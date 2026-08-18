"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KituwaNav } from "../../components/kituwa-nav";
import type { ProjectRecord } from "@/lib/matter/kituwa-contract-types";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectRecord | null>(null);

  useEffect(() => {
    void fetch("/api/kituwa/projects", { cache: "no-store" }).then(async (res) => {
      const data = await res.json();
      const hit = (data.projects || []).find((p: ProjectRecord) => p.project_id === params.projectId);
      setProject(hit || null);
    });
  }, [params.projectId]);

  if (!project) return <main className="kituwa-shell"><p className="kituwa-status">Loading project…</p></main>;

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">{project.name}</h1>
        </div>
      </header>
      <KituwaNav />
      <p className="kituwa-using">Confidence: {project.confidence}</p>
      <ul className="kituwa-task-list">
        {project.task_ids.map((id) => (
          <li key={id}>
            <Link href={`/tasks/${id}`}>{id}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
