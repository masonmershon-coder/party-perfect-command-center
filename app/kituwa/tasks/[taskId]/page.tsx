"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KituwaNav } from "../../components/kituwa-nav";
import type { MessageRecord, ProjectRecord, TaskRecord } from "@/lib/matter/kituwa-contract-types";

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [message, setMessage] = useState<MessageRecord | null>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [subtasks, setSubtasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    if (!params.taskId) return;
    void fetch(`/api/matter/tasks/${params.taskId}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/kituwa";
          return;
        }
        const data = await res.json();
        setTask(data.task);
        setMessage(data.message);
        setProject(data.project);
        setSubtasks(data.subtasks || []);
      });
  }, [params.taskId]);

  if (!task) return <main className="kituwa-shell"><p className="kituwa-status">Loading task…</p></main>;

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Task detail</h1>
        </div>
      </header>
      <KituwaNav />
      <section className="kituwa-task-detail">
        <dl>
          <dt>task_id</dt><dd><code>{task.task_id}</code></dd>
          <dt>message_id</dt><dd><code>{task.message_id}</code></dd>
          <dt>conversation_id</dt><dd><code>{task.conversation_id}</code></dd>
          <dt>status</dt><dd>{task.status}</dd>
          <dt>owner</dt><dd>{task.owner}</dd>
          <dt>business agent</dt><dd>{task.business_agent_id || "matter"}</dd>
          <dt>assigned worker</dt><dd>{task.assigned_worker_id || "none"}</dd>
          <dt>verifier</dt><dd>{task.verifier_id || "none"}</dd>
          <dt>blocked reason</dt><dd>{task.blocked_reason || "none"}</dd>
          <dt>approval</dt><dd>{task.approval_state}</dd>
          <dt>retry</dt><dd>{task.retry_count}</dd>
          <dt>lease</dt><dd>{task.lease_state}</dd>
          <dt>dead letter</dt><dd>{task.dead_letter_state || "none"}</dd>
          <dt>created</dt><dd><time dateTime={task.created_at}>{task.created_at}</time></dd>
          <dt>updated</dt><dd><time dateTime={task.updated_at}>{task.updated_at}</time></dd>
        </dl>
        {project ? (
          <p>
            Project: <Link href={`/projects/${project.project_id}`}>{project.name}</Link>
          </p>
        ) : null}
        {message ? <p className="kituwa-msg">{message.text}</p> : null}
      </section>

      <section>
        <h2 className="kituwa-section-title">Rejected workers</h2>
        <ul className="kituwa-rejected">
          {task.rejected_workers.map((r) => (
            <li key={r.worker_id}>
              {r.worker_id} · {r.provider || "unknown"} · {r.trust_state} · {r.reasons.join("; ")}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="kituwa-section-title">Event history</h2>
        <ol className="kituwa-events">
          {task.events.map((ev) => (
            <li key={ev.id}>
              <time dateTime={ev.at}>{ev.at}</time> · {ev.kind} · {ev.detail}
            </li>
          ))}
        </ol>
      </section>

      {subtasks.length ? (
        <section>
          <h2 className="kituwa-section-title">Subtasks</h2>
          <ul className="kituwa-task-list">
            {subtasks.map((st) => (
              <li key={st.task_id}>
                <Link href={`/tasks/${st.task_id}`}>{st.title} · {st.status}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
