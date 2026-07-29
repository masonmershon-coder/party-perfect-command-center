"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import { MADISON_COMMS_AGENT_ID, MIKE_OPERATIONS_AGENT_ID } from "@/lib/seed";
import type { Agent } from "@/lib/types";

const AGENT_CAPABILITIES: Record<string, string[]> = {
  [MIKE_OPERATIONS_AGENT_ID]: [
    "Generate & send weekly recaps via SMS",
    "Monitor tasks and inventory levels",
    "Live inbox & social watch",
    "Catch Up priority queue",
  ],
  [MADISON_COMMS_AGENT_ID]: [
    "Facebook & Instagram replies",
    "Tulsa engagement trends",
    "Michelle client email drafts",
    "Warm, upbeat brand voice",
  ],
};

export function AgentsSection({
  agents,
  onSelectAgent,
  madisonLive = false,
  lastSocialSyncAt = null,
}: {
  agents: Agent[];
  onSelectAgent: (agentId: string) => void;
  madisonLive?: boolean;
  lastSocialSyncAt?: string | null;
}) {
  return (
    <div>
      <PageHeader
        eyebrow="AI Team"
        title="Command Center Agents"
        description="Mike handles operations and management alerts. Madison owns social and client communications."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {agents.map((agent) => {
          const capabilities = AGENT_CAPABILITIES[agent.id] ?? [];
          const isMadison = agent.id === MADISON_COMMS_AGENT_ID;

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className="pp-panel card-hover rounded-2xl p-6 text-left transition hover:border-[var(--pp-accent)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pp-accent-soft)] text-3xl">
                  {agent.icon}
                </span>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={agent.status} />
                  {isMadison && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        madisonLive
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-[var(--pp-border)] text-[var(--pp-text-muted)]"
                      }`}
                    >
                      {madisonLive ? "Live socials" : "Socials demo"}
                    </span>
                  )}
                </div>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[var(--pp-text)]">
                {agent.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--pp-text-muted)]">
                {agent.description}
              </p>
              {isMadison && (
                <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
                  {madisonLive
                    ? lastSocialSyncAt
                      ? `Watching Facebook + Instagram · last sync ${new Date(lastSocialSyncAt).toLocaleString()}`
                      : "Watching Facebook + Instagram (Live Mode + 10‑min cron)"
                    : "Connect Meta on Social to put Madison on live FB/IG."}
                </p>
              )}
              <ul className="mt-4 space-y-1.5">
                {capabilities.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-xs text-[var(--pp-text-muted)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-accent)]" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs font-semibold pp-accent-text">
                Open agent →
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
