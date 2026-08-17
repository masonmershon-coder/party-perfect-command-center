"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/app/components/dashboard/page-header";

type Tab =
  | "shelly"
  | "employees"
  | "leave"
  | "payroll"
  | "security"
  | "working"
  | "exceptions"
  | "timecards"
  | "locations"
  | "import";

type QueueItem = {
  kind: "correction" | "absence" | "time_off";
  id: string;
  employeeId: string;
  state: string;
  summary: string;
  createdAt: string;
};

type SecurityAlert = {
  kind: "security_alert";
  id: string;
  employeeId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  reasonCodes: string[];
  createdAt: string;
  routeTo: string;
};

type AdminEmployee = {
  id: string;
  preferredName: string;
  firstName: string;
  lastName: string;
  department: string;
  title: string;
  active: boolean;
  ptoEligible: boolean;
  vacationEligible: boolean;
  startDate: string | null;
  notes: string;
  pinConfigured: boolean;
  pinStatus: "configured" | "not_set";
  deviceStatus: "registered" | "none" | "revoked";
  timeStatus: "active" | "inactive";
  setupStatus: "NOT_SET_UP" | "INVITED" | "DEVICE_REGISTERED" | "ACTIVE" | "INACTIVE";
  role: string;
  protected: boolean;
  onboardingUrl: string;
};

async function loadJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function TimePayrollSection() {
  const [tab, setTab] = useState<Tab>("shelly");
  const [overview, setOverview] = useState<{
    whoIsWorking: { employee: { preferredName: string }; status: string; since: string | null }[];
    exceptions: { type: string; employeeId: string; message: string }[];
    punchReady: boolean;
    payrollReady: boolean;
    shellyQueueOpen?: number;
    securityAlertsOpen?: number;
    securityAlertsHigh?: number;
    flow?: string;
    note?: string;
  } | null>(null);
  const [queue, setQueue] = useState<{ open: QueueItem[]; awaitingClarification: QueueItem[] } | null>(null);
  const [securityQueue, setSecurityQueue] = useState<{
    open: SecurityAlert[];
    high: SecurityAlert[];
  } | null>(null);
  const [selected, setSelected] = useState<{
    kind: QueueItem["kind"] | "security_alert";
    id: string;
    item: Record<string, unknown>;
    messages: { authorRole: string; body: string; createdAt: string }[];
  } | null>(null);
  const [remark, setRemark] = useState("");
  const [approvedCorrection, setApprovedCorrection] = useState("");
  const [adminClass, setAdminClass] = useState("unclassified");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [onboardingUrl, setOnboardingUrl] = useState("https://partyperfect.app/time");
  const [locations, setLocations] = useState<{ id: string; name: string; address: string; active: boolean; verified: boolean; latitude: number | null; longitude: number | null; radiusM: number }[]>([]);
  const [timecards, setTimecards] = useState<{ punches: { id: string; employeeId: string; type: string; occurredAt: string }[]; shifts: { id: string; employeeId: string; startAt: string; endAt: string | null; status: string }[] } | null>(null);
  const [payroll, setPayroll] = useState<{ exceptions: { type: string; message: string }[]; payPeriods: { id: string; startDate: string; endDate: string; status: string }[]; payrollReady: boolean } | null>(null);
  const [csv, setCsv] = useState("");
  const [importResult, setImportResult] = useState("");
  const [error, setError] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [addForm, setAddForm] = useState({
    firstName: "",
    lastName: "",
    department: "",
    title: "",
    pin: "",
    startDate: "",
    ptoEligible: false,
    vacationEligible: false,
    role: "employee",
    notes: "",
  });
  const [pinResetId, setPinResetId] = useState<string | null>(null);
  const [pinResetValue, setPinResetValue] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [lastOnboarding, setLastOnboarding] = useState<{ name: string; url: string } | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [ov, em, loc, tc, pay, q, sec] = await Promise.all([
        loadJson<NonNullable<typeof overview>>("/api/time/admin/overview"),
        loadJson<{ employees: AdminEmployee[]; onboardingUrl?: string }>("/api/time/admin/employees"),
        loadJson<{ locations: typeof locations }>("/api/time/admin/locations"),
        loadJson<NonNullable<typeof timecards>>("/api/time/admin/timecards"),
        loadJson<NonNullable<typeof payroll>>("/api/time/admin/payroll"),
        loadJson<{ open: QueueItem[]; awaitingClarification: QueueItem[] }>("/api/time/admin/requests"),
        loadJson<{ open: SecurityAlert[]; high: SecurityAlert[] }>("/api/time/admin/security"),
      ]);
      setOverview(ov);
      setEmployees(em.employees);
      if (em.onboardingUrl) setOnboardingUrl(em.onboardingUrl);
      setLocations(loc.locations);
      setTimecards(tc);
      setPayroll(pay);
      setQueue(q);
      setSecurityQueue(sec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load timekeeping.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openItem = useCallback(async (item: QueueItem) => {
    const data = await loadJson<{
      item: Record<string, unknown>;
      messages: { authorRole: string; body: string; createdAt: string }[];
    }>(`/api/time/admin/requests?kind=${item.kind}&id=${item.id}`);
    setSelected({ kind: item.kind, id: item.id, item: data.item, messages: data.messages || [] });
    setRemark(String(data.item.adminRemark || data.item.managerRemark || ""));
    setApprovedCorrection(String(data.item.approvedCorrection || data.item.requestedCorrection || ""));
    setAdminClass(String(data.item.adminClass || "unclassified"));
  }, []);

  const openSecurityAlert = useCallback(async (item: SecurityAlert) => {
    const data = await loadJson<{ item: Record<string, unknown> }>(
      `/api/time/admin/security?id=${item.id}`,
    );
    setSelected({
      kind: "security_alert",
      id: item.id,
      item: data.item,
      messages: [],
    });
  }, []);

  const act = useCallback(
    async (state: "approved" | "denied" | "needs_clarification" | "ack") => {
      if (!selected) return;
      if (selected.kind === "security_alert") {
        await fetch("/api/time/admin/security", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, acknowledge: true }),
        });
        setSelected(null);
        await refresh();
        return;
      }
      await fetch("/api/time/admin/requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: selected.kind,
          id: selected.id,
          state,
          adminRemark: remark,
          managerRemark: remark,
          approvedCorrection: selected.kind === "correction" ? approvedCorrection : undefined,
          adminClass: selected.kind === "absence" ? adminClass : undefined,
          clarification: state === "needs_clarification" ? remark : undefined,
        }),
      });
      setSelected(null);
      await refresh();
    },
    [selected, remark, approvedCorrection, adminClass, refresh],
  );

  const employeeAction = useCallback(
    async (id: string, action: string, extra?: Record<string, unknown>) => {
      setError("");
      const res = await fetch("/api/time/admin/employees", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setPinResetId(null);
      setPinResetValue("");
      setEditId(null);
      await refresh();
    },
    [refresh],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "shelly", label: `Time Review${overview?.shellyQueueOpen ? ` (${overview.shellyQueueOpen})` : ""}` },
    { id: "employees", label: "Employees" },
    { id: "leave", label: "Time Off / Absences" },
    { id: "payroll", label: "Payroll Ready" },
    {
      id: "security",
      label: `Security · Mason/Michelle${overview?.securityAlertsOpen ? ` (${overview.securityAlertsOpen})` : ""}`,
    },
    { id: "working", label: "Who’s Working" },
    { id: "exceptions", label: "Exceptions" },
    { id: "timecards", label: "Timecards" },
    { id: "locations", label: "Locations" },
    { id: "import", label: "Square import" },
  ];

  const filteredEmployees = employees.filter((e) => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return true;
    return `${e.firstName} ${e.lastName} ${e.department} ${e.setupStatus}`.toLowerCase().includes(q);
  });

  const leaveItems = (queue?.open || []).filter((i) => i.kind === "absence" || i.kind === "time_off");
  const needsSetupCount = employees.filter(
    (e) => e.active && (e.setupStatus === "NOT_SET_UP" || e.setupStatus === "INVITED"),
  ).length;

  return (
    <section>
      <PageHeader
        eyebrow="Timekeeping"
        title="Time & Payroll"
        description="Shelly: Time Review · Employees · PIN / device onboarding · Time Off. Mason/Michelle: Security. Michelle: Payroll Ready. Migration 0009 is held."
      />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <p className="mb-4 text-sm text-[var(--pp-text-muted)]">
        Time Review: {overview?.shellyQueueOpen ?? 0} open
        {" · "}
        Need setup help: {needsSetupCount}
        {" · "}
        Security: {overview?.securityAlertsOpen ?? 0}
        {overview?.securityAlertsHigh ? ` (${overview.securityAlertsHigh} HIGH)` : ""}
        {" · "}
        Payroll ready: {overview?.payrollReady ? "yes" : "not yet"}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              tab === t.id ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]" : "border-[var(--pp-border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "shelly" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {(queue?.open || []).length === 0 ? (
              <li className="text-sm text-[var(--pp-text-muted)]">Shelly’s review queue is clear.</li>
            ) : (
              (queue?.open || []).map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--pp-border)] px-3 py-2 text-left text-sm"
                    onClick={() => void openItem(item)}
                  >
                    <span className="font-semibold uppercase tracking-wide text-[10px] text-[var(--pp-text-muted)]">
                      {item.kind} · {item.state}
                    </span>
                    <div>{item.summary}</div>
                    <div className="text-[var(--pp-text-muted)]">{item.employeeId}</div>
                  </button>
                </li>
              ))
            )}
          </ul>
          {selected && selected.kind !== "security_alert" ? (
            <div className="rounded-xl border border-[var(--pp-border)] p-4 text-sm space-y-3">
              <p className="font-semibold">
                {selected.kind} · {selected.id}
              </p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-[var(--pp-panel)] p-2 text-xs">
                {JSON.stringify(selected.item, null, 2)}
              </pre>
              <ul className="space-y-1">
                {selected.messages.map((m, i) => (
                  <li key={i} className="text-xs">
                    <strong>{m.authorRole}:</strong> {m.body}
                  </li>
                ))}
              </ul>
              {selected.kind === "absence" ? (
                <select
                  className="w-full rounded-lg border border-[var(--pp-border)] px-2 py-2"
                  value={adminClass}
                  onChange={(e) => setAdminClass(e.target.value)}
                >
                  <option value="unclassified">Admin class: unclassified</option>
                  <option value="sick">sick</option>
                  <option value="vacation">vacation</option>
                  <option value="personal">personal</option>
                  <option value="pto">pto (eligible only)</option>
                  <option value="unpaid">unpaid</option>
                  <option value="other">other</option>
                </select>
              ) : null}
              {selected.kind === "correction" ? (
                <input
                  className="w-full rounded-lg border border-[var(--pp-border)] px-2 py-2"
                  placeholder="Approved correction (authorized change)"
                  value={approvedCorrection}
                  onChange={(e) => setApprovedCorrection(e.target.value)}
                />
              ) : null}
              <textarea
                className="w-full rounded-lg border border-[var(--pp-border)] px-2 py-2"
                rows={3}
                placeholder="Shelly remark / clarification question (separate from employee note)"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs" onClick={() => void act("approved")}>
                  Approve
                </button>
                <button type="button" className="rounded-lg border border-red-600 px-3 py-1.5 text-xs" onClick={() => void act("denied")}>
                  Deny
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-600 px-3 py-1.5 text-xs"
                  onClick={() => void act("needs_clarification")}
                >
                  Ask employee
                </button>
                <button type="button" className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--pp-text-muted)]">Select a Fix My Time, absence, or time-off request.</p>
          )}
        </div>
      ) : null}

      {tab === "security" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs text-[var(--pp-text-muted)]">
              Mason primary · Michelle owner visibility. Review signals only — never automatic accusation. Shelly is not on this queue.
            </p>
            {(securityQueue?.open || []).length === 0 ? (
              <p className="text-sm text-[var(--pp-text-muted)]">No open security alerts.</p>
            ) : (
              (securityQueue?.open || []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-xl border border-[var(--pp-border)] px-3 py-2 text-left text-sm"
                  onClick={() => void openSecurityAlert(item)}
                >
                  <span
                    className={`font-semibold uppercase tracking-wide text-[10px] ${
                      item.severity === "HIGH"
                        ? "text-red-700"
                        : item.severity === "MEDIUM"
                          ? "text-amber-700"
                          : "text-[var(--pp-text-muted)]"
                    }`}
                  >
                    {item.severity} · {item.routeTo}
                  </span>
                  <div>{item.summary}</div>
                  <div className="text-[var(--pp-text-muted)]">{item.employeeId}</div>
                </button>
              ))
            )}
          </div>
          {selected?.kind === "security_alert" ? (
            <div className="rounded-xl border border-[var(--pp-border)] p-4 text-sm space-y-3">
              <p className="font-semibold">Security evidence · {selected.id}</p>
              <p className="text-xs text-amber-800">Review signal only — not an accusation of theft.</p>
              <pre className="max-h-72 overflow-auto rounded-lg bg-[var(--pp-panel)] p-2 text-xs">
                {JSON.stringify(selected.item, null, 2)}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs"
                  onClick={() => void act("ack")}
                >
                  Mark reviewed (Mason / Michelle)
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--pp-text-muted)]">Select a security alert to inspect full punch evidence.</p>
          )}
        </div>
      ) : null}

      {tab === "working" ? (
        <ul className="space-y-2">
          {(overview?.whoIsWorking || []).length === 0 ? (
            <li className="text-sm text-[var(--pp-text-muted)]">Nobody is clocked in.</li>
          ) : (
            overview!.whoIsWorking.map((w, i) => (
              <li key={i} className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-sm">
                {w.employee.preferredName} · {w.status.replace("_", " ")}
                {w.since ? ` · since ${new Date(w.since).toLocaleString()}` : ""}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "exceptions" ? (
        <ul className="space-y-2">
          {(overview?.exceptions || []).length === 0 ? (
            <li className="text-sm text-[var(--pp-text-muted)]">No open exceptions.</li>
          ) : (
            overview!.exceptions.map((e, i) => (
              <li key={i} className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm">
                {e.type}: {e.message} ({e.employeeId})
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "employees" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] px-3 py-2 text-sm font-semibold"
              onClick={() => setShowAddEmployee((v) => !v)}
            >
              + Add Employee
            </button>
            <input
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--pp-border)] px-3 py-2 text-sm"
              placeholder="Search employees"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
            />
            <span className="text-xs text-[var(--pp-text-muted)]">Install link: {onboardingUrl}</span>
          </div>

          {lastOnboarding ? (
            <div className="rounded-xl border border-emerald-600/40 bg-emerald-50/50 px-3 py-2 text-sm">
              <strong>{lastOnboarding.name}</strong> saved. Share install link:{" "}
              <a className="underline" href={lastOnboarding.url} target="_blank" rel="noreferrer">
                {lastOnboarding.url}
              </a>
              <span className="text-[var(--pp-text-muted)]">
                {" "}
                · They sign in with First + Last Name + the PIN you set. PIN is never shown here again.
              </span>
            </div>
          ) : null}

          {showAddEmployee ? (
            <form
              className="grid gap-2 rounded-xl border border-[var(--pp-border)] p-4 sm:grid-cols-2"
              onSubmit={async (ev) => {
                ev.preventDefault();
                setError("");
                const res = await fetch("/api/time/admin/employees", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(addForm),
                });
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  employee?: AdminEmployee;
                  onboardingUrl?: string;
                };
                if (!res.ok) {
                  setError(data.error || `HTTP ${res.status}`);
                  return;
                }
                setLastOnboarding({
                  name: `${addForm.firstName} ${addForm.lastName}`.trim(),
                  url: data.onboardingUrl || onboardingUrl,
                });
                setAddForm({
                  firstName: "",
                  lastName: "",
                  department: "",
                  title: "",
                  pin: "",
                  startDate: "",
                  ptoEligible: false,
                  vacationEligible: false,
                  role: "employee",
                  notes: "",
                });
                setShowAddEmployee(false);
                await refresh();
              }}
            >
              <p className="sm:col-span-2 text-sm font-semibold">Add employee · PIN management</p>
              <input
                required
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                placeholder="First Name *"
                value={addForm.firstName}
                onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
              />
              <input
                required
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                placeholder="Last Name *"
                value={addForm.lastName}
                onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
              />
              <input
                required
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                placeholder="Department *"
                value={addForm.department}
                onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))}
              />
              <input
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                placeholder="Job Title / Position"
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
              />
              <input
                required
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                placeholder="4-Digit PIN *"
                value={addForm.pin}
                onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              />
              <input
                type="date"
                className="rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                value={addForm.startDate}
                onChange={(e) => setAddForm((f) => ({ ...f, startDate: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm">
                <span>PTO Eligible</span>
                <select
                  className="rounded-lg border border-[var(--pp-border)] px-2 py-1"
                  value={addForm.ptoEligible ? "yes" : "no"}
                  onChange={(e) => setAddForm((f) => ({ ...f, ptoEligible: e.target.value === "yes" }))}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span>Vacation Eligible</span>
                <select
                  className="rounded-lg border border-[var(--pp-border)] px-2 py-1"
                  value={addForm.vacationEligible ? "yes" : "no"}
                  onChange={(e) => setAddForm((f) => ({ ...f, vacationEligible: e.target.value === "yes" }))}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <span>Admin / Employee Role</span>
                <select
                  className="rounded-lg border border-[var(--pp-border)] px-2 py-1"
                  value={addForm.role}
                  onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="employee">Employee</option>
                  <option value="timekeeping">Timekeeping helper (ops cleanup — not Owner/security)</option>
                </select>
              </label>
              <textarea
                className="sm:col-span-2 rounded-lg border border-[var(--pp-border)] px-2 py-2 text-sm"
                rows={2}
                placeholder="Notes (optional)"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <p className="sm:col-span-2 text-xs text-[var(--pp-text-muted)]">
                Employee ID is generated automatically. No employee number required for Time login. PIN is hashed — never stored or shown in plaintext.
              </p>
              <button type="submit" className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold">
                Save Employee
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--pp-border)] px-3 py-2 text-sm"
                onClick={() => setShowAddEmployee(false)}
              >
                Cancel
              </button>
            </form>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-[var(--pp-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--pp-border)] text-xs uppercase tracking-wide text-[var(--pp-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Setup</th>
                  <th className="px-3 py-2">PIN</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--pp-border)]/60 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {e.firstName} {e.lastName}
                      </div>
                      <div className="text-xs text-[var(--pp-text-muted)]">{e.title || "—"}</div>
                    </td>
                    <td className="px-3 py-2">{e.department || "—"}</td>
                    <td className="px-3 py-2">{e.timeStatus}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          e.setupStatus === "ACTIVE"
                            ? "text-emerald-700"
                            : e.setupStatus === "INACTIVE"
                              ? "text-[var(--pp-text-muted)]"
                              : "text-amber-700"
                        }
                      >
                        {e.setupStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">{e.pinStatus === "configured" ? "Configured" : "Not set"}</td>
                    <td className="px-3 py-2">{e.deviceStatus}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {!e.protected ? (
                          <>
                            <button type="button" className="underline" onClick={() => setEditId(editId === e.id ? null : e.id)}>
                              Edit
                            </button>
                            <button type="button" className="underline" onClick={() => setPinResetId(pinResetId === e.id ? null : e.id)}>
                              Reset PIN
                            </button>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => void employeeAction(e.id, "restart_onboarding")}
                            >
                              Reset Device
                            </button>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                setTab("timecards");
                              }}
                            >
                              View Timecard
                            </button>
                            {e.active ? (
                              <button
                                type="button"
                                className="underline text-red-700"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Deactivate ${e.firstName} ${e.lastName}? They cannot clock in. History is kept.`,
                                    )
                                  ) {
                                    void employeeAction(e.id, "deactivate");
                                  }
                                }}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button type="button" className="underline" onClick={() => void employeeAction(e.id, "reactivate")}>
                                Reactivate
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-[var(--pp-text-muted)]">Owner/security protected</span>
                        )}
                      </div>
                      {pinResetId === e.id ? (
                        <form
                          className="mt-2 flex flex-wrap gap-2"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            void employeeAction(e.id, "reset_pin", { pin: pinResetValue });
                          }}
                        >
                          <input
                            inputMode="numeric"
                            pattern="\d{4}"
                            maxLength={4}
                            className="rounded border border-[var(--pp-border)] px-2 py-1"
                            placeholder="New 4-digit PIN"
                            value={pinResetValue}
                            onChange={(ev) => setPinResetValue(ev.target.value.replace(/\D/g, "").slice(0, 4))}
                          />
                          <button type="submit" className="rounded border border-emerald-600 px-2 py-1">
                            Save new PIN
                          </button>
                          <span className="text-[var(--pp-text-muted)]">Sets a new PIN (old PIN cannot be retrieved).</span>
                        </form>
                      ) : null}
                      {editId === e.id ? (
                        <form
                          className="mt-2 grid max-w-lg gap-2"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            const fd = new FormData(ev.currentTarget);
                            void employeeAction(e.id, "update", {
                              firstName: String(fd.get("firstName") || ""),
                              lastName: String(fd.get("lastName") || ""),
                              department: String(fd.get("department") || ""),
                              title: String(fd.get("title") || ""),
                              startDate: String(fd.get("startDate") || "") || null,
                              notes: String(fd.get("notes") || ""),
                              ptoEligible: fd.get("ptoEligible") === "yes",
                              vacationEligible: fd.get("vacationEligible") === "yes",
                              role: String(fd.get("role") || "employee"),
                            });
                          }}
                        >
                          <input name="firstName" defaultValue={e.firstName} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <input name="lastName" defaultValue={e.lastName} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <input name="department" defaultValue={e.department} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <input name="title" defaultValue={e.title} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <input name="startDate" type="date" defaultValue={e.startDate || ""} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <select name="ptoEligible" defaultValue={e.ptoEligible ? "yes" : "no"} className="rounded border border-[var(--pp-border)] px-2 py-1">
                            <option value="no">PTO: No</option>
                            <option value="yes">PTO: Yes</option>
                          </select>
                          <select name="vacationEligible" defaultValue={e.vacationEligible ? "yes" : "no"} className="rounded border border-[var(--pp-border)] px-2 py-1">
                            <option value="no">Vacation: No</option>
                            <option value="yes">Vacation: Yes</option>
                          </select>
                          <select name="role" defaultValue={e.role === "timekeeping" ? "timekeeping" : "employee"} className="rounded border border-[var(--pp-border)] px-2 py-1">
                            <option value="employee">Employee</option>
                            <option value="timekeeping">Timekeeping helper</option>
                          </select>
                          <textarea name="notes" defaultValue={e.notes} rows={2} className="rounded border border-[var(--pp-border)] px-2 py-1" />
                          <button type="submit" className="rounded border border-emerald-600 px-2 py-1">
                            Save changes
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "leave" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2">
            {leaveItems.length === 0 ? (
              <li className="text-sm text-[var(--pp-text-muted)]">No open absences or time-off requests.</li>
            ) : (
              leaveItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[var(--pp-border)] px-3 py-2 text-left text-sm"
                    onClick={() => void openItem(item)}
                  >
                    <span className="font-semibold uppercase tracking-wide text-[10px] text-[var(--pp-text-muted)]">
                      {item.kind} · {item.state}
                    </span>
                    <div>{item.summary}</div>
                  </button>
                </li>
              ))
            )}
          </ul>
          {selected && selected.kind !== "security_alert" && (selected.kind === "absence" || selected.kind === "time_off") ? (
            <div className="rounded-xl border border-[var(--pp-border)] p-4 text-sm space-y-3">
              <p className="font-semibold">
                {selected.kind} · {selected.id}
              </p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-[var(--pp-panel)] p-2 text-xs">
                {JSON.stringify(selected.item, null, 2)}
              </pre>
              {selected.kind === "absence" ? (
                <select
                  className="w-full rounded-lg border border-[var(--pp-border)] px-2 py-2"
                  value={adminClass}
                  onChange={(e) => setAdminClass(e.target.value)}
                >
                  <option value="unclassified">Admin class: unclassified</option>
                  <option value="sick">sick</option>
                  <option value="vacation">vacation</option>
                  <option value="personal">personal</option>
                  <option value="pto">pto (eligible only)</option>
                  <option value="unpaid">unpaid</option>
                  <option value="other">other</option>
                </select>
              ) : null}
              <textarea
                className="w-full rounded-lg border border-[var(--pp-border)] px-2 py-2"
                rows={3}
                placeholder="Remark / clarification"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs" onClick={() => void act("approved")}>
                  Approve
                </button>
                <button type="button" className="rounded-lg border border-red-600 px-3 py-1.5 text-xs" onClick={() => void act("denied")}>
                  Deny
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-600 px-3 py-1.5 text-xs"
                  onClick={() => void act("needs_clarification")}
                >
                  Ask employee
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--pp-text-muted)]">Select an absence or time-off request.</p>
          )}
        </div>
      ) : null}

      {tab === "timecards" ? (
        <ul className="space-y-2">
          {(timecards?.shifts || []).map((s) => (
            <li key={s.id} className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-sm">
              {s.employeeId} · {s.status} · {new Date(s.startAt).toLocaleString()}
              {s.endAt ? ` → ${new Date(s.endAt).toLocaleString()}` : " (open)"}
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "payroll" ? (
        <div className="space-y-3">
          <p className="text-sm">Michelle final payroll checklist — after Shelly cleanup. Paychex file upload is out of V1.</p>
          <p className="text-sm">Ready: {payroll?.payrollReady ? "yes" : "no — clear Shelly queue and exceptions first"}</p>
          {(payroll?.payPeriods || []).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-[var(--pp-border)] px-3 py-2 text-sm">
              <span>
                {p.startDate} → {p.endDate} · {p.status}
              </span>
              {p.status !== "finalized" ? (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={async () => {
                    await fetch("/api/time/admin/payroll", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "finalize", id: p.id }),
                    });
                    await refresh();
                  }}
                >
                  Finalize
                </button>
              ) : (
                <span>locked</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {tab === "locations" ? (
        <ul className="space-y-3">
          {locations.map((l) => (
            <li key={l.id} className="rounded-xl border border-[var(--pp-border)] px-3 py-3 text-sm">
              <p className="font-semibold">{l.name}</p>
              <p className="text-[var(--pp-text-muted)]">{l.address}</p>
              <p>
                active={String(l.active)} verified={String(l.verified)} lat={l.latitude ?? "—"} lng={l.longitude ?? "—"} r={l.radiusM}m
              </p>
              <p className="mt-1 text-xs text-amber-700">Do not activate until Mason verifies coordinates.</p>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "import" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--pp-text-muted)]">
            Dry-run by default. Wage and labor-cost columns are ignored. Uncertain identities are not merged.
          </p>
          <textarea
            className="h-40 w-full rounded-xl border border-[var(--pp-border)] p-3 font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="Paste Square time CSV"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--pp-accent)] px-3 py-2 text-sm"
              onClick={async () => {
                const res = await fetch("/api/time/admin/import", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ csv, commit: false }),
                });
                setImportResult(JSON.stringify(await res.json(), null, 2));
              }}
            >
              Dry-run
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-600 px-3 py-2 text-sm"
              onClick={async () => {
                const res = await fetch("/api/time/admin/import", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ csv, commit: true }),
                });
                setImportResult(JSON.stringify(await res.json(), null, 2));
                await refresh();
              }}
            >
              Commit import
            </button>
          </div>
          {importResult ? <pre className="overflow-auto rounded-xl bg-[var(--pp-panel)] p-3 text-xs">{importResult}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}
