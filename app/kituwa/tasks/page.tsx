"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KituwaNav } from "../components/kituwa-nav";
import type { TaskRecord } from "@/lib/matter/kituwa-contract-types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    void fetch("/api/kituwa/tasks", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/kituwa";
          return;
        }
        const data = await res.json();
        setTasks(data.tasks || []);
      });
  }, []);

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Tasks</h1>
        </div>
      </header>
      <KituwaNav />
      <ul className="kituwa-task-list">
        {tasks.map((task) => (
          <li key={task.task_id}>
            <Link href={`/tasks/${task.task_id}`}>
              <strong>{task.title}</strong>
              <span>{task.status}</span>
              <small>{task.updated_at}</small>
            </Link>
          </li>
        ))}
      </ul>
      {!tasks.length ? <p className="kituwa-using">No durable tasks yet.</p> : null}
    </main>
  );
}
