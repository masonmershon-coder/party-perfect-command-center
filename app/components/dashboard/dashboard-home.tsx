"use client";

import { CatchUpPanel } from "@/app/components/dashboard/catch-up-panel";
import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import { MADISON_COMMS_AGENT_ID, MIKE_OPERATIONS_AGENT_ID } from "@/lib/seed";
import type { Agent, CatchUpItem, DashboardStats, SavedReport, Task } from "@/lib/types";
import { formatTime } from "@/lib/ui";

export function DashboardHome({
  stats,
  agents,
  tasks,
  reports,
  liveModeEnabled,
  lastCheckedAt,
  onNavigateAgents,
  onNavigateTasks,
  onNavigateEmails,
  onNavigateSocial,
  onNavigateReports,
  onCatchUpOpen,
  onSelectAgent,
}: {
  stats: DashboardStats;
  agents: Agent[];
  tasks: Task[];
  reports: SavedReport[];
  liveModeEnabled: boolean;
  lastCheckedAt: string | null;
  onNavigateAgents: () => void;
  onNavigateTasks: () => void;
  onNavigateEmails: () => void;
  onNavigateSocial: () => void;
  onNavigateReports: () => void;
  onCatchUpOpen: (item: CatchUpItem, draftReply: boolean) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  const recentTasks = tasks.slice(0, 5);
  const latestReport = reports[0] ?? null;
  const mike = agents.find((agent) => agent.id === MIKE_OPERATIONS_AGENT_ID);
  const madison = agents.find((agent) => agent.id === MADISON_COMMS_AGENT_ID);

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Command Center"
        description="Live operations view for Party Perfect Event Rentals — Tulsa, Oklahoma."
        action={
          liveModeEnabled ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/50 px-3 py-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-[var(--pp-accent)] pp-live-pulse-dot" />
              <span className="font-medium pp-accent-text">Live</span>
              <span className="text-[var(--pp-text-muted)]">
                {lastCheckedAt
                  ? `Updated ${formatTime(lastCheckedAt)}`
                  : "Mike is watching inboxes"}
              </span>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: "Emails Need Reply",
            value: stats.emailsNeedsReply,
            hint: `${stats.emailsUnread} unread`,
          },
          {
            label: "Social Waiting",
            value: stats.socialNeedsReply,
            hint: `${stats.socialUnread} unread total`,
          },
          {
            label: "Tasks To Do",
            value: stats.tasksTodo,
            hint: `${stats.tasksInProgress} in progress`,
          },
          {
            label: "Low Inventory",
            value: stats.inventoryLow,
            hint: "Items below 25% available",
          },
          {
            label: "Pending Bills",
            value: stats.bookkeepingPending,
            hint: latestReport
              ? `Last recap ${formatTime(latestReport.generatedAt)}`
              : "No recap saved yet",
          },
        ].map((card) => (
          <div key={card.label} className="pp-stat-card rounded-2xl p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-semibold pp-accent-text">
              {card.value}
            </p>
            <p className="mt-2 text-[11px] text-[var(--pp-text-muted)]">
              {card.hint}
            </p>
          </div>
        ))}
      </div>

      <CatchUpPanel variant="dashboard" onOpenItem={onCatchUpOpen} />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {[mike, madison].filter(Boolean).map((agent) => (
          <button
            key={agent!.id}
            type="button"
            onClick={() => onSelectAgent(agent!.id)}
            className="pp-panel card-hover rounded-2xl p-5 text-left transition hover:border-[var(--pp-accent)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--pp-accent-muted)] text-2xl">
                  {agent!.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--pp-text)]">
                    {agent!.name}
                  </p>
                  <p className="text-[11px] text-[var(--pp-text-muted)]">
                    {agent!.description}
                  </p>
                </div>
              </div>
              <StatusBadge status={agent!.status} />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="pp-panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--pp-text)]">
              To-Do Queue
            </h3>
            <button
              type="button"
              onClick={onNavigateTasks}
              className="text-xs font-medium pp-accent-text hover:underline"
            >
              Task board
            </button>
          </div>
          <div className="space-y-3">
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--pp-text)]">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                      {task.description}
                    </p>
                  </div>
                  <StatusBadge status={task.status} kind="task" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pp-panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--pp-text)]">
              Quick Actions
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Open Emails", action: onNavigateEmails },
              { label: "Social Inbox", action: onNavigateSocial },
              { label: "View Agents", action: onNavigateAgents },
              { label: "Saved Reports", action: onNavigateReports },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3 text-left text-sm font-medium text-[var(--pp-text)] transition hover:border-[var(--pp-accent)] hover:pp-accent-text"
              >
                {item.label}
              </button>
            ))}
          </div>
          {latestReport && (
            <div className="mt-4 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
                Latest report
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--pp-text)]">
                {latestReport.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--pp-text-muted)]">
                {latestReport.content}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
