"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/dashboard/page-header";

type Money = { display: string; known: number; unknownCount: number; class: string; verification: string };

type Summary = {
  timezone: string;
  asOf: string;
  period: { day: string; month: string };
  fixedMonthly: Money;
  meteredToday: Money;
  meteredThisMonth: Money;
  infrastructureThisMonth: Money;
  estimatedTotalThisMonth: Money;
  providerVerifiedTotal: Money;
  projectedMonthEnd: { display: string; basis: string; confidence: string };
  monthOverMonth: string;
  unattributedUsage: { count: number; display: string };
  dataFreshness: { label: string; stale: boolean };
  coverage?: { providerId: string; collector: string; usageApi: string; note: string; lastSuccessAt: string | null; lastFailure: string | null }[];
  activeAlertCount: number;
  guardrail: string;
};

type ProviderRow = {
  providerId: string;
  label: string;
  plan: string;
  fixedRecurring: Money;
  metered: Money;
  usage: { inputTokens: number | null; outputTokens: number | null; requests: number };
  billingPeriod: string;
  projection: string;
  dataSource: string;
  lastSyncedAt: string | null;
  verificationStatus: string;
  budget: string;
  alertStatus: string;
  agents: string[];
};

type AgentRow = {
  agentId: string;
  label: string;
  tasksStarted: number;
  tasksCompleted: number;
  tasksFailed: number;
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  audioSeconds: number | null;
  estimatedIncremental: Money;
  verifiedBilled: Money;
  avgCostPerCompletedTask: string;
  highestCostTask: { taskId: string; display: string } | null;
  retryCost: Money;
  duplicateWorkCost: Money;
  dateRange: string;
  billedAccuracyNote: string;
};

type TaskRow = {
  taskId: string | null;
  agentId: string;
  provider: string;
  model: string | null;
  startAt: string;
  estimatedDisplay: string;
  retryCount: number;
  status: string;
  domain: string;
  correlationId: string | null;
  humanTriggered: boolean;
};

type SubRow = {
  id: string;
  providerId: string;
  plan: string;
  amount: number | null;
  cadence: string;
  verificationStatus: string;
  notes: string;
  purpose: string;
  accountOwner: string;
  partyPerfectAllocationPct: number | null;
  kind: string;
  domain: string;
};

type AlertRow = { id: string; type: string; severity: string; message: string; count: number; active: boolean };
type BudgetRow = { id: string; scope: string; providerId: string | null; amountUsd: number; period: string };

function escapeText(value: string) {
  return value.replace(/[<>]/g, "");
}

export function AiCostSection() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "providers" | "agents" | "tasks" | "subs" | "alerts">("summary");
  const [domain, setDomain] = useState<"party_perfect" | "mershon_personal">("party_perfect");
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p, a, t, sub, al, b] = await Promise.all([
        fetch("/api/ai-cost/summary", { credentials: "include", cache: "no-store" }),
        fetch("/api/ai-cost/providers", { credentials: "include", cache: "no-store" }),
        fetch("/api/ai-cost/agents", { credentials: "include", cache: "no-store" }),
        fetch(`/api/ai-cost/tasks?domain=${domain}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/ai-cost/subscriptions", { credentials: "include", cache: "no-store" }),
        fetch("/api/ai-cost/alerts", { credentials: "include", cache: "no-store" }),
        fetch("/api/ai-cost/budgets", { credentials: "include", cache: "no-store" }),
      ]);
      if (s.status === 401 || s.status === 403) {
        setError("Owner session required for AI Cost & Usage.");
        return;
      }
      if (!s.ok) {
        setError("Could not load AI cost data.");
        return;
      }
      setSummary((await s.json()) as Summary);
      if (p.ok) setProviders(((await p.json()) as { providers: ProviderRow[] }).providers || []);
      if (a.ok) setAgents(((await a.json()) as { agents: AgentRow[] }).agents || []);
      if (t.ok) setTasks(((await t.json()) as { tasks: TaskRow[] }).tasks || []);
      if (sub.ok) setSubs(((await sub.json()) as { subscriptions: SubRow[] }).subscriptions || []);
      if (al.ok) setAlerts(((await al.json()) as { alerts: AlertRow[] }).alerts || []);
      if (b.ok) setBudgets(((await b.json()) as { budgets: BudgetRow[] }).budgets || []);
    } catch {
      setError("Could not load AI cost data.");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNote(id: string) {
    const notes = note[id];
    if (notes == null) return;
    const res = await fetch("/api/ai-cost/subscriptions", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, notes }),
    });
    if (res.ok) void load();
  }

  const tabs = useMemo(
    () =>
      [
        ["summary", "Summary"],
        ["providers", "Providers"],
        ["agents", "Agents"],
        ["tasks", "Tasks"],
        ["subs", "Subscriptions"],
        ["alerts", "Budgets & alerts"],
      ] as const,
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Owners"
        title="AI Cost & Usage"
        description="Observes spend only. Does not change provider billing. Estimated and verified amounts stay labeled separately. America/Chicago."
        action={
          <a
            href="/api/ai-cost/export"
            className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-xs font-semibold"
          >
            Export CSV
          </a>
        }
      />

      {loading ? <p className="text-sm text-[var(--pp-text-muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              tab === id
                ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]"
                : "border-[var(--pp-border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" && summary ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            {escapeText(summary.guardrail)}
          </div>
          <p className="text-xs text-[var(--pp-text-muted)]">
            {summary.period.day} · {summary.timezone} · freshness: {escapeText(summary.dataFreshness.label)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Fixed monthly", summary.fixedMonthly],
              ["Metered today", summary.meteredToday],
              ["Metered this month", summary.meteredThisMonth],
              ["Infrastructure this month", summary.infrastructureThisMonth],
              ["Estimated total this month", summary.estimatedTotalThisMonth],
              ["Provider-verified total", summary.providerVerifiedTotal],
            ].map(([label, money]) => (
              <div key={String(label)} className="rounded-2xl border border-[var(--pp-border)] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pp-text-muted)]">{String(label)}</p>
                <p className="mt-2 text-xl font-semibold">{(money as Money).display}</p>
                <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                  {(money as Money).class} · {(money as Money).verification}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--pp-border)] p-4 text-sm">
            <p>Projected month-end: {summary.projectedMonthEnd.display}</p>
            <p className="text-[var(--pp-text-muted)]">{escapeText(summary.projectedMonthEnd.basis)}</p>
            <p className="mt-2">Month-over-month metered: {summary.monthOverMonth}</p>
            <p>Unattributed: {summary.unattributedUsage.display}</p>
            <p>Active alerts: {summary.activeAlertCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--pp-border)] p-4 text-sm">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pp-text-muted)]">Data coverage</p>
            {(summary.coverage || []).map((c) => (
              <p key={c.providerId} className="mt-1">
                {escapeText(c.providerId)} · {escapeText(c.collector)} · API {escapeText(c.usageApi)} · {escapeText(c.note)}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "providers" ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                <th className="p-2">Provider</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Fixed</th>
                <th className="p-2">Metered</th>
                <th className="p-2">Usage</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.providerId} className="border-t border-[var(--pp-border)] align-top">
                  <td className="p-2 font-medium">{escapeText(p.label)}</td>
                  <td className="p-2">{escapeText(p.plan)}</td>
                  <td className="p-2">{p.fixedRecurring.display}</td>
                  <td className="p-2">{p.metered.display}</td>
                  <td className="p-2 text-xs">
                    req {p.usage.requests}
                    {p.usage.inputTokens != null ? ` · in ${p.usage.inputTokens}` : ""}
                    {p.usage.outputTokens != null ? ` · out ${p.usage.outputTokens}` : ""}
                    <div>{escapeText(p.dataSource)}</div>
                    <div>{p.lastSyncedAt ? `synced ${p.lastSyncedAt}` : "no sync"}</div>
                  </td>
                  <td className="p-2 text-xs">
                    {escapeText(p.verificationStatus)} · budget {escapeText(p.budget)} · {escapeText(p.alertStatus)}
                    <div>agents: {p.agents.map(escapeText).join(", ") || "none"}</div>
                    <div>proj {p.projection}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {providers.length === 0 && !loading ? <p className="p-3 text-sm text-[var(--pp-text-muted)]">No providers yet.</p> : null}
        </div>
      ) : null}

      {tab === "agents" ? (
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.agentId} className="rounded-2xl border border-[var(--pp-border)] p-4 text-sm">
              <p className="font-semibold">{escapeText(a.label)}</p>
              <p className="text-xs text-[var(--pp-text-muted)]">{escapeText(a.dateRange)}</p>
              <p className="mt-2">
                started {a.tasksStarted} · completed {a.tasksCompleted} · failed {a.tasksFailed} · calls {a.modelCalls}
              </p>
              <p>estimated incremental {a.estimatedIncremental.display} · verified billed {a.verifiedBilled.display}</p>
              <p>avg / completed task {a.avgCostPerCompletedTask}</p>
              <p>retry {a.retryCost.display} · duplicate work {a.duplicateWorkCost.display}</p>
              {a.highestCostTask ? <p>highest task {escapeText(a.highestCostTask.taskId)} {a.highestCostTask.display}</p> : null}
              <p className="mt-1 text-xs text-[var(--pp-text-muted)]">{escapeText(a.billedAccuracyNote)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div>
          <div className="mb-3 flex gap-2">
            <button type="button" className="text-xs underline" onClick={() => setDomain("party_perfect")}>
              Party Perfect
            </button>
            <button type="button" className="text-xs underline" onClick={() => setDomain("mershon_personal")}>
              Mershon personal
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                  <th className="p-2">Task</th>
                  <th className="p-2">Agent</th>
                  <th className="p-2">Provider</th>
                  <th className="p-2">Cost</th>
                  <th className="p-2">Domain</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={`${t.taskId || "none"}-${i}`} className="border-t border-[var(--pp-border)]">
                    <td className="p-2 text-xs">
                      {escapeText(t.taskId || "n/a")}
                      <div>{escapeText(t.correlationId || "")}</div>
                      <div>{t.humanTriggered ? "human-triggered" : "automated"} · retry {t.retryCount}</div>
                    </td>
                    <td className="p-2">{escapeText(t.agentId)}</td>
                    <td className="p-2">
                      {escapeText(t.provider)} {escapeText(t.model || "")}
                    </td>
                    <td className="p-2">{t.estimatedDisplay}</td>
                    <td className="p-2">{escapeText(t.domain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "subs" ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--pp-text-muted)]">
            Editing this ledger never changes the provider subscription. Seed values are USER_REPORTED.
          </p>
          {subs.map((s) => (
            <div key={s.id} className="rounded-2xl border border-[var(--pp-border)] p-4 text-sm">
              <p className="font-semibold">
                {escapeText(s.providerId)} · {escapeText(s.plan)}
              </p>
              <p>
                {s.amount == null ? "UNKNOWN" : `$${s.amount}`} / {escapeText(s.cadence)} · {escapeText(s.verificationStatus)} · {escapeText(s.kind)} · {escapeText(s.domain)}
              </p>
              <p>Owner {escapeText(s.accountOwner)} · PP allocation {s.partyPerfectAllocationPct ?? "n/a"}%</p>
              <p>{escapeText(s.purpose)}</p>
              <p className="text-[var(--pp-text-muted)]">{escapeText(s.notes)}</p>
              <textarea
                className="mt-2 w-full rounded-xl border border-[var(--pp-border)] bg-transparent p-2 text-sm"
                rows={2}
                value={note[s.id] ?? s.notes}
                onChange={(e) => setNote((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />
              <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => void saveNote(s.id)}>
                Save note (audited)
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "alerts" ? (
        <div className="space-y-4">
          <p className="text-xs text-[var(--pp-text-muted)]">
            No default Mason budget is invented. Configure thresholds here. Alerts are deduplicated.
          </p>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pp-text-muted)]">Budgets</p>
            {budgets.length === 0 ? <p className="text-sm">None configured.</p> : null}
            {budgets.map((b) => (
              <p key={b.id} className="text-sm">
                {escapeText(b.scope)} {b.providerId ? escapeText(b.providerId) : ""} ${b.amountUsd} / {escapeText(b.period)}
              </p>
            ))}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pp-text-muted)]">Alerts</p>
            {alerts.length === 0 ? <p className="text-sm">No active alerts.</p> : null}
            {alerts.map((a) => (
              <div key={a.id} className="mt-2 rounded-xl border border-[var(--pp-border)] p-3 text-sm">
                <p className="font-semibold">
                  {escapeText(a.severity)} · {escapeText(a.type)} ×{a.count}
                </p>
                <p>{escapeText(a.message)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
