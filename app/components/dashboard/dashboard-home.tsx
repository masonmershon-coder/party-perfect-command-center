"use client";

import { CatchUpPanel } from "@/app/components/dashboard/catch-up-panel";
import { AiCostStatusCard } from "@/app/components/dashboard/ai-cost-status-card";
import { SecurityHealthCard } from "@/app/components/dashboard/security-health-card";
import { PageHeader } from "@/app/components/dashboard/page-header";
import {
  PorFreshnessBadge,
  PorSyncBanner,
} from "@/app/components/dashboard/por-sync-banner";
import { PorSyncHealthPanel } from "@/app/components/dashboard/por-sync-health-panel";
import { StatusBadge } from "@/app/components/status-badge";
import { MADISON_COMMS_AGENT_ID, MIKE_OPERATIONS_AGENT_ID } from "@/lib/seed";
import type { Agent, CatchUpItem, DashboardStats, PorSyncMeta, SavedReport, Task } from "@/lib/types";
import { formatCurrency, formatTime } from "@/lib/ui";

export function DashboardHome({
  stats,
  agents,
  tasks,
  reports,
  liveModeEnabled,
  lastCheckedAt,
  isOwner = false,
  onNavigateAgents,
  onNavigateTasks,
  onNavigateEmails,
  onNavigateSocial,
  onNavigateReports,
  onCatchUpOpen,
  onSelectAgent,
  onNavigateSecurity,
  onNavigateAiCost,
}: {
  stats: DashboardStats;
  agents: Agent[];
  tasks: Task[];
  reports: SavedReport[];
  liveModeEnabled: boolean;
  lastCheckedAt: string | null;
  isOwner?: boolean;
  onNavigateAgents: () => void;
  onNavigateTasks: () => void;
  onNavigateEmails: () => void;
  onNavigateSocial: () => void;
  onNavigateReports: () => void;
  onCatchUpOpen: (item: CatchUpItem, draftReply: boolean) => void;
  onSelectAgent: (agentId: string) => void;
  onNavigateSecurity?: () => void;
  onNavigateAiCost?: () => void;
}) {
  const recentTasks = tasks.slice(0, 5);
  const latestReport = reports[0] ?? null;
  const mike = agents.find((agent) => agent.id === MIKE_OPERATIONS_AGENT_ID);
  const madison = agents.find((agent) => agent.id === MADISON_COMMS_AGENT_ID);
  const por = stats.por;
  const porLive = Boolean(por?.syncedAt);
  const porMeta: PorSyncMeta | null = por
    ? {
        present: porLive,
        stale: Boolean(por.stale),
        veryStale: Boolean(por.veryStale),
        freshness:
          por.freshness ??
          (por.veryStale ? "very_stale" : por.stale ? "stale" : "fresh"),
        syncedAt: por.syncedAt,
        ageMs: por.ageMs ?? null,
        ageLabel: por.ageLabel ?? null,
        sourceHost: null,
      }
    : null;

  const summaryCards = [
    {
      label: "Emails Need Reply",
      value: String(stats.emailsNeedsReply),
      hint: `${stats.emailsUnread} unread`,
      demo: stats.dataSources?.emails === "demo",
    },
    {
      label: "Social Waiting",
      value: String(stats.socialNeedsReply),
      hint: `${stats.socialUnread} unread total`,
      demo: stats.dataSources?.social === "demo",
    },
    {
      label: "Tasks To Do",
      value: String(stats.tasksTodo),
      hint: `${stats.tasksInProgress} in progress`,
      demo: stats.dataSources?.tasks !== "live",
    },
    {
      label: "Low Inventory",
      value: String(stats.inventoryLow),
      hint: "Rentable items below 25% available",
      demo: stats.dataSources?.inventory === "demo",
    },
    ...(isOwner
      ? [
          porLive && stats.por?.arOpenBalance != null
            ? {
                label: "Open AR",
                value: formatCurrency(stats.por.arOpenBalance),
                hint: "Money owed TO Party Perfect (POR)",
                demo: false,
              }
            : {
                label: "Pending Bills",
                value: String(stats.bookkeepingPending),
                hint: latestReport
                  ? `Last recap ${formatTime(latestReport.generatedAt)}`
                  : "Vendor bills we owe (AP)",
                demo: false,
              },
          ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Command Center"
        description={
          porLive
            ? "Live POR ops where synced. Email/social/task counts may still be demo until IMAP/Meta are live."
            : "Operations overview — connect POR sync for live inventory and AR."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {porLive ? (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  por?.veryStale
                    ? "border-red-500/40 bg-red-500/10"
                    : por?.stale
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/50"
                }`}
              >
                <PorFreshnessBadge porMeta={porMeta} />
                <span className="text-[var(--pp-text-muted)]">
                  {por?.ageLabel ??
                    (por?.syncedAt
                      ? `synced ${formatTime(por.syncedAt)}`
                      : "POR")}
                </span>
              </div>
            ) : null}
            {liveModeEnabled ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/50 px-3 py-2 text-xs">
                <span className="h-2 w-2 rounded-full bg-[var(--pp-accent)] pp-live-pulse-dot" />
                <span className="font-medium pp-accent-text">Watching</span>
                <span className="text-[var(--pp-text-muted)]">
                  {lastCheckedAt
                    ? `Updated ${formatTime(lastCheckedAt)}`
                    : "Mike is watching inboxes"}
                </span>
              </div>
            ) : null}
          </div>
        }
      />

      {porLive && porMeta ? (
        <PorSyncBanner source="por" porMeta={porMeta} label="ops snapshot" />
      ) : null}

      <SecurityHealthCard
        onOpenInbox={isOwner ? onNavigateSecurity : undefined}
      />
      {isOwner ? <AiCostStatusCard onOpen={onNavigateAiCost} /> : null}

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          isOwner ? "xl:grid-cols-5" : "xl:grid-cols-4"
        }`}
      >
        {summaryCards.map((card) => (
          <div key={card.label} className="pp-stat-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
                {card.label}
              </p>
              {card.demo ? (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                  Demo
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-3xl font-semibold pp-accent-text">
              {card.value}
            </p>
            <p className="mt-2 text-[11px] text-[var(--pp-text-muted)]">
              {card.hint}
            </p>
          </div>
        ))}
      </div>

      <section
        className={`mt-6 rounded-2xl border p-5 ${
          por?.veryStale
            ? "border-red-500/40 bg-red-500/5"
            : por?.stale
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-[var(--pp-border)] bg-[var(--pp-panel)]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
              Today at Party Perfect
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--pp-text)]">
                Point of Rental snapshot
              </h3>
              <PorFreshnessBadge porMeta={porMeta} />
            </div>
            <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
              {porLive
                ? por?.veryStale
                  ? `POR sync stale — data may be outdated · ${por.ageLabel ?? "last sync unknown"}${por.syncedAt ? ` (${formatTime(por.syncedAt)})` : ""}`
                  : por?.stale
                    ? `POR sync stale · ${por.ageLabel ?? (por.syncedAt ? formatTime(por.syncedAt) : "unknown")}`
                    : `Read-only mirror · ${por?.ageLabel ?? (por?.syncedAt ? `synced ${formatTime(por.syncedAt)}` : "")}`
                : "Waiting for ENTERPRISE sync agent. POR stays the system of record."}
            </p>
          </div>
        </div>
        <div
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${
            isOwner ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          {[
            {
              label: "Out on rent",
              value: porLive
                ? String(
                    por?.itemsOutRentable ?? por?.inventoryOut ?? "—",
                  )
                : "—",
              hint: "Rentable only (fees excluded)",
            },
            {
              label: "Deliveries today",
              value: porLive ? String(por?.deliveriesToday ?? "—") : "—",
              hint: "From POR ops",
            },
            {
              label: "Returns due",
              value: porLive ? String(por?.returnsDueToday ?? "—") : "—",
              hint: "From POR ops",
            },
            ...(isOwner
              ? [
                  {
                    label: "AR open",
                    value:
                      porLive && por?.arOpenBalance != null
                        ? formatCurrency(por.arOpenBalance)
                        : "—",
                    hint: "Owner only",
                  },
                ]
              : []),
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold pp-accent-text">
                {item.value}
              </p>
              {"hint" in item && item.hint ? (
                <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                  {item.hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {isOwner ? <PorSyncHealthPanel /> : null}

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
              ...(isOwner
                ? [{ label: "Saved Reports", action: onNavigateReports }]
                : []),
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
          {latestReport && isOwner && (
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
