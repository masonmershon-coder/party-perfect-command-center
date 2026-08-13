"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/app/components/dashboard/page-header";
import { SecurityHealthCard } from "@/app/components/dashboard/security-health-card";

type InboxEvent = {
  id: string;
  ts: string;
  severity: string;
  kind: string;
  title: string;
  summary: string;
  status: string;
  source: "collector" | "app";
  asset?: string;
  relatedTask?: string;
  signalCount?: number;
  signalIds?: string[];
  ipPrefix?: string;
  uaFamily?: string;
  sessionHash?: string;
  outcome?: string;
  role?: string;
};

type InjectionStatus = {
  events: number;
  signalCount: number;
  byId: Record<string, number>;
};

export function SecuritySection() {
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<InboxEvent | null>(null);
  const [injection, setInjection] = useState<InjectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inboxRes, injRes] = await Promise.all([
        fetch("/api/sentinel/events?limit=80", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/sentinel/injection-status", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (inboxRes.status === 401 || inboxRes.status === 403) {
        setError("Owner session required for Security Inbox.");
        return;
      }
      if (!inboxRes.ok) {
        setError("Could not load security events.");
        return;
      }
      const inbox = (await inboxRes.json()) as {
        events: InboxEvent[];
        total: number;
      };
      setEvents(inbox.events || []);
      setTotal(inbox.total || 0);
      if (injRes.ok) {
        setInjection((await injRes.json()) as InjectionStatus);
      }
    } catch {
      setError("Could not load security events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEvent(id: string) {
    try {
      const res = await fetch(`/api/sentinel/events/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { event: InboxEvent };
      setSelected(data.event);
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Owner"
        title="Security Inbox"
        description="Read-only monitoring for Mason. Sentinel has no business authority and cannot change POR, quotes, or hiring."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-xs font-semibold"
          >
            Refresh
          </button>
        }
      />

      <SecurityHealthCard />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-card)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
            Open events
          </p>
          <p className="mt-2 text-2xl font-semibold">{total}</p>
        </div>
        <div className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-card)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
            Injection signals
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {injection?.signalCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
            Counts only — matched text is never shown.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-card)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
            Flagged surfaces
          </p>
          <p className="mt-2 text-2xl font-semibold">{injection?.events ?? 0}</p>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-[var(--pp-border)]">
          <div className="border-b border-[var(--pp-border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            Alerts
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-[var(--pp-text-muted)]">
              Loading…
            </p>
          ) : events.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--pp-text-muted)]">
              No security events yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--pp-border)]">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => void openEvent(event.id)}
                    className="block w-full px-4 py-3 text-left hover:bg-[var(--pp-accent-muted)]/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{event.title}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                        {event.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--pp-text-muted)]">
                      {event.summary || "No summary"}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                      {event.ts ? new Date(event.ts).toLocaleString() : ""} ·{" "}
                      {event.source}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--pp-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            Drilldown
          </p>
          {selected ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                  Kind
                </dt>
                <dd>{selected.kind}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                  Summary
                </dt>
                <dd>{selected.summary || "—"}</dd>
              </div>
              {selected.asset ? (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Asset
                  </dt>
                  <dd>{selected.asset}</dd>
                </div>
              ) : null}
              {selected.relatedTask ? (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Related task
                  </dt>
                  <dd>{selected.relatedTask}</dd>
                </div>
              ) : null}
              {selected.signalCount != null ? (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Injection signals
                  </dt>
                  <dd>
                    {selected.signalCount}
                    {selected.signalIds?.length
                      ? ` (${selected.signalIds.join(", ")})`
                      : ""}
                  </dd>
                </div>
              ) : null}
              {selected.ipPrefix || selected.uaFamily || selected.sessionHash ? (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Auth telemetry
                  </dt>
                  <dd>
                    {[selected.role, selected.outcome, selected.ipPrefix, selected.uaFamily, selected.sessionHash]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--pp-text-muted)]">
              Select an alert. Raw secrets and unnecessary PII are never shown.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
