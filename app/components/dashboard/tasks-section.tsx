"use client";

import { PageHeader, LiveStatusBar } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import type { Agent, Task, TaskStatus } from "@/lib/types";
import { taskStatusLabels } from "@/lib/ui";
import { FormEvent, useEffect, useRef, useState } from "react";

const columns: TaskStatus[] = ["todo", "in_progress", "done"];

export function TasksSection({
  tasks,
  agents,
  runningTaskId,
  onCreateTask,
  onUpdateStatus,
  onRunTask,
  liveModeEnabled = false,
  lastCheckedAt = null,
  isRefreshing = false,
}: {
  tasks: Task[];
  agents: Agent[];
  runningTaskId: string | null;
  onCreateTask: (input: {
    agentId: string;
    title: string;
    description: string;
  }) => Promise<void>;
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onRunTask: (taskId: string) => Promise<void>;
  liveModeEnabled?: boolean;
  lastCheckedAt?: string | null;
  isRefreshing?: boolean;
}) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [todoBump, setTodoBump] = useState(false);
  const prevTodoCountRef = useRef(
    tasks.filter((task) => task.status === "todo").length,
  );

  const todoCount = tasks.filter((task) => task.status === "todo").length;

  useEffect(() => {
    if (todoCount !== prevTodoCountRef.current) {
      prevTodoCountRef.current = todoCount;
      if (liveModeEnabled) {
        setTodoBump(true);
        const timer = window.setTimeout(() => setTodoBump(false), 1200);
        return () => window.clearTimeout(timer);
      }
    }
    return undefined;
  }, [todoCount, liveModeEnabled]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!agentId || !title.trim()) return;

    setLoading(true);
    try {
      await onCreateTask({ agentId, title, description });
      setTitle("");
      setDescription("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Task Board"
        description="Track work across your agent team with To Do, In Progress, and Done columns."
      />

      <LiveStatusBar
        enabled={liveModeEnabled}
        checking={isRefreshing}
        lastCheckedAt={lastCheckedAt}
        isRefreshing={isRefreshing}
      />

      <form
        onSubmit={handleSubmit}
        className="pp-panel mb-8 grid gap-3 rounded-2xl p-5 md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <select
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          className="pp-input px-4 py-3 text-sm"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task title"
          className="pp-input px-4 py-3 text-sm"
          required
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          className="pp-input px-4 py-3 text-sm"
          required
        />
        <button type="submit" disabled={loading} className="pp-btn-primary px-5 py-3 text-sm">
          Add Task
        </button>
      </form>

      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <section
            key={column}
            className={`pp-panel p-5 ${
              column === "todo" && liveModeEnabled ? "ring-1 ring-[var(--pp-accent)]/20" : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider pp-accent-text">
                {taskStatusLabels[column]}
              </h3>
              <span
                className={`pp-badge px-2 py-0.5 ${
                  column === "todo" && todoBump ? "pp-live-count-bump" : ""
                }`}
              >
                {tasks.filter((t) => t.status === column).length}
              </span>
            </div>
            <div className="space-y-3">
              {tasks
                .filter((task) => task.status === column)
                .map((task) => {
                  const agent = agents.find((a) => a.id === task.agentId);
                  const isRunning = runningTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--pp-text)]">
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                            {task.description}
                          </p>
                          {agent && (
                            <p className="mt-2 text-[11px] pp-accent-text">
                              {agent.icon} {agent.name}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={task.status} kind="task" />
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--pp-border)]">
                        <div
                          className="h-full rounded-full bg-[var(--pp-accent)]"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {columns
                          .filter((s) => s !== task.status)
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => void onUpdateStatus(task.id, status)}
                              className="pp-btn-secondary px-2 py-1 text-[11px]"
                            >
                              {taskStatusLabels[status]}
                            </button>
                          ))}
                        <button
                          type="button"
                          disabled={isRunning || task.status === "done"}
                          onClick={() => void onRunTask(task.id)}
                          className="pp-btn-primary px-2 py-1 text-[11px] disabled:opacity-50"
                        >
                          {isRunning ? "Running…" : "Run with Grok"}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
