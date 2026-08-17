"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimeCapability } from "@/lib/time/types";

export type TimeAdminScreen =
  | "admin-review"
  | "admin-employees"
  | "admin-leave"
  | "admin-payroll"
  | "admin-security";

type QueueItem = {
  kind: "correction" | "absence" | "time_off";
  id: string;
  employeeId: string;
  state: string;
  summary: string;
};

type AdminEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  title: string;
  active: boolean;
  ptoEligible: boolean;
  vacationEligible: boolean;
  startDate: string | null;
  notes: string;
  pinStatus: "configured" | "not_set";
  deviceStatus: "registered" | "none" | "revoked";
  setupStatus: "NOT_SET_UP" | "INVITED" | "DEVICE_REGISTERED" | "ACTIVE" | "INACTIVE";
  protected: boolean;
  role: string;
};

type PayrollPayload = {
  payrollReady: boolean;
  currentPeriod: { id?: string; startDate: string; endDate: string; status: string } | null;
  payPeriods?: { id: string; startDate: string; endDate: string; status: string }[];
  incompleteTimecards: number;
  unresolvedRequests: number;
  lateNightRule?: {
    window: string;
    feeAmount: number | null;
    feeConfigured: boolean;
    note: string;
  };
  employeeHours: {
    employeeId: string;
    employeeName: string;
    regularHours: number;
    overtimeHours: number;
    leaveHoursApplied: number;
    ptoHours?: number;
    vacationHours?: number;
    lateNightCount?: number;
    lateNightDates?: string[];
    lateNightOccurrences?: {
      shiftId: string;
      occurrenceDate: string;
      shiftStartAt: string;
      shiftEndAt: string;
    }[];
    lateNightFeeAmount?: number | null;
    incomplete: boolean;
  }[];
};

type SecurityAlert = {
  id: string;
  employeeId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
};

type AuthenticationAlert = {
  id: string;
  severity: "MEDIUM" | "HIGH";
  summary: string;
  target: string;
  lastAt: string;
};

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const REQUEST_FIELD_LABELS: Record<string, string> = {
  issueType: "Request type",
  employeeExplanation: "Employee explanation",
  requestedCorrection: "Requested time",
  approvedCorrection: "Approved correction",
  affectedDate: "Affected date",
  adminRemark: "Manager notes",
  managerRemark: "Manager notes",
  employeeNote: "Employee note",
  reason: "Reason",
  startDate: "Start date",
  endDate: "End date",
  state: "Status",
  adminClass: "Classification",
  leaveHoursApplied: "Leave hours applied",
  createdAt: "Submitted",
  updatedAt: "Updated",
  decidedAt: "Decided",
};

function humanizeField(key: string) {
  return REQUEST_FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function canUseTimeAdmin(capabilities: TimeCapability[]) {
  return capabilities.some((capability) =>
    [
      "timekeeping.review",
      "timekeeping.employees",
      "timekeeping.payroll",
      "timekeeping.admin",
      "timekeeping.security",
      "timekeeping.owner",
    ].includes(capability),
  );
}

export function TimeAdminPanel({
  screen,
  capabilities,
}: {
  screen: TimeAdminScreen;
  capabilities: TimeCapability[];
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [operationalExceptions, setOperationalExceptions] = useState<
    { type: string; employeeId: string; message: string }[]
  >([]);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [payroll, setPayroll] = useState<PayrollPayload | null>(null);
  const [security, setSecurity] = useState<SecurityAlert[]>([]);
  const [authenticationAlerts, setAuthenticationAlerts] = useState<AuthenticationAlert[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<{
    kind: QueueItem["kind"];
    id: string;
    item: Record<string, unknown>;
    messages: { authorRole: string; body: string }[];
  } | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<AdminEmployee | null>(null);
  const [selectedTimecard, setSelectedTimecard] = useState<{
    employeeId: string;
    shifts: { id: string; startAt: string; endAt: string | null; status: string }[];
  } | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newPinFor, setNewPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [remark, setRemark] = useState("");
  const [approvedCorrection, setApprovedCorrection] = useState("");
  const [adminClass, setAdminClass] = useState("unclassified");
  const [leaveHoursApplied, setLeaveHoursApplied] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState("https://partyperfect.app/time");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [add, setAdd] = useState({
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
  const [syncStatus, setSyncStatus] = useState<{
    health?: string;
    lastSuccessfulSync?: string | null;
    openShifts?: number;
    authority?: string;
    configured?: boolean;
    missingEnv?: string[];
    lastError?: string | null;
  } | null>(null);

  const owner = capabilities.includes("timekeeping.owner");
  const canSecurity =
    owner || capabilities.includes("timekeeping.security");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const sync = await adminApi<{
        health?: string;
        lastSuccessfulSync?: string | null;
        openShifts?: number;
        authority?: string;
        configured?: boolean;
        missingEnv?: string[];
        lastError?: string | null;
      }>("/api/time/admin/sync");
      setSyncStatus(sync);
      if (screen === "admin-review" || screen === "admin-leave") {
        const [data, overview] = await Promise.all([
          adminApi<{ open: QueueItem[] }>("/api/time/admin/requests"),
          adminApi<{
            exceptions: { type: string; employeeId: string; message: string }[];
          }>("/api/time/admin/overview"),
        ]);
        setQueue(data.open || []);
        setOperationalExceptions(overview.exceptions || []);
      } else if (screen === "admin-employees") {
        const data = await adminApi<{ employees: AdminEmployee[]; onboardingUrl: string }>(
          "/api/time/admin/employees",
        );
        setEmployees(data.employees || []);
        setOnboardingUrl(data.onboardingUrl || onboardingUrl);
      } else if (screen === "admin-payroll") {
        setPayroll(await adminApi<PayrollPayload>("/api/time/admin/payroll"));
      } else if (screen === "admin-security" && canSecurity) {
        const data = await adminApi<{
          open: SecurityAlert[];
          authenticationAlerts: AuthenticationAlert[];
        }>("/api/time/admin/security");
        setSecurity(data.open || []);
        setAuthenticationAlerts(data.authenticationAlerts || []);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load Time administration.");
    }
  }, [canSecurity, onboardingUrl, screen]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      `${employee.firstName} ${employee.lastName} ${employee.department} ${employee.setupStatus}`
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  async function openRequest(item: QueueItem) {
    try {
      const data = await adminApi<{
        item: Record<string, unknown>;
        messages: { authorRole: string; body: string }[];
      }>(`/api/time/admin/requests?kind=${item.kind}&id=${item.id}`);
      setSelectedRequest({ kind: item.kind, id: item.id, item: data.item, messages: data.messages || [] });
      setRemark(String(data.item.adminRemark || data.item.managerRemark || ""));
      setApprovedCorrection(String(data.item.approvedCorrection || data.item.requestedCorrection || ""));
      setAdminClass(String(data.item.adminClass || "unclassified"));
      setLeaveHoursApplied(
        data.item.leaveHoursApplied != null ? String(data.item.leaveHoursApplied) : "",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open request.");
    }
  }

  async function reviewRequest(state: "approved" | "denied" | "needs_clarification") {
    if (!selectedRequest) return;
    const leaveHours =
      selectedRequest.kind === "absence" &&
      state === "approved" &&
      (adminClass === "pto" || adminClass === "vacation") &&
      leaveHoursApplied.trim()
        ? Number(leaveHoursApplied)
        : undefined;
    if (
      selectedRequest.kind === "absence" &&
      state === "approved" &&
      (adminClass === "pto" || adminClass === "vacation") &&
      (leaveHours == null || !Number.isFinite(leaveHours) || leaveHours <= 0)
    ) {
      setError("Enter leave hours to apply when approving PTO or vacation.");
      return;
    }
    try {
      await adminApi("/api/time/admin/requests", {
        method: "PATCH",
        body: JSON.stringify({
          kind: selectedRequest.kind,
          id: selectedRequest.id,
          state,
          adminRemark: remark,
          managerRemark: remark,
          approvedCorrection:
            selectedRequest.kind === "correction" ? approvedCorrection : undefined,
          adminClass: selectedRequest.kind === "absence" ? adminClass : undefined,
          leaveHoursApplied: leaveHours,
          clarification: state === "needs_clarification" ? remark : undefined,
        }),
      });
      setSelectedRequest(null);
      setLeaveHoursApplied("");
      setNotice("Request updated.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update request.");
    }
  }

  async function employeeAction(id: string, action: string, extra?: Record<string, unknown>) {
    try {
      await adminApi("/api/time/admin/employees", {
        method: "PATCH",
        body: JSON.stringify({ id, action, ...extra }),
      });
      setNewPinFor(null);
      setNewPin("");
      setSelectedEmployee(null);
      setNotice("Employee updated.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update employee.");
    }
  }

  async function viewTimecard(employee: AdminEmployee) {
    try {
      const data = await adminApi<{
        shifts: { id: string; startAt: string; endAt: string | null; status: string }[];
      }>(`/api/time/admin/timecards?employeeId=${encodeURIComponent(employee.id)}`);
      setSelectedTimecard({ employeeId: employee.id, shifts: data.shifts || [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load timecard.");
    }
  }

  async function openSecurity(id: string) {
    try {
      const data = await adminApi<{ item: Record<string, unknown> }>(
        `/api/time/admin/security?id=${encodeURIComponent(id)}`,
      );
      setSelectedEvidence({ ...data.item, id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load evidence.");
    }
  }

  async function acknowledgeSecurity(id: string) {
    try {
      await adminApi("/api/time/admin/security", {
        method: "PATCH",
        body: JSON.stringify({ id, acknowledge: true }),
      });
      setSelectedEvidence(null);
      setNotice("Security alert acknowledged.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not acknowledge alert.");
    }
  }

  async function finalizePayPeriod(id: string) {
    try {
      await adminApi("/api/time/admin/payroll", {
        method: "POST",
        body: JSON.stringify({ action: "finalize", id }),
      });
      setNotice("Pay period finalized.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finalize pay period.");
    }
  }

  const leaveOnly = screen === "admin-leave";
  const visibleQueue = queue.filter((item) =>
    leaveOnly ? item.kind === "absence" || item.kind === "time_off" : true,
  );

  return (
    <section className="time-admin">
      {error ? <div className="time-error">{error}</div> : null}
      {notice ? <div className="time-admin-notice">{notice}</div> : null}
      {syncStatus ? (
        <div
          className="time-admin-notice"
          style={{
            background:
              syncStatus.health === "HEALTHY"
                ? "#e8f7ee"
                : syncStatus.health === "NOT_CONFIGURED"
                  ? "#fff8e6"
                  : "#fde8e8",
          }}
        >
          <strong>SQUARE SYNC · {syncStatus.health || "—"}</strong>
          <div style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
            {syncStatus.authority}
          </div>
          <div style={{ fontSize: "0.85rem" }}>
            Last successful:{" "}
            {syncStatus.lastSuccessfulSync
              ? new Date(syncStatus.lastSuccessfulSync).toLocaleString()
              : "never"}
            {" · "}Open shifts: {syncStatus.openShifts ?? 0}
          </div>
          {!syncStatus.configured ? (
            <div style={{ fontSize: "0.85rem" }}>
              Needs Labor API scopes on Square token ({(syncStatus.missingEnv || []).join(", ") || "config"}).
            </div>
          ) : null}
          {syncStatus.lastError ? (
            <div style={{ fontSize: "0.85rem" }}>{syncStatus.lastError}</div>
          ) : null}
          <button
            type="button"
            className="time-btn"
            style={{ marginTop: "0.5rem" }}
            onClick={() =>
              void adminApi("/api/time/admin/sync", {
                method: "POST",
                body: JSON.stringify({ action: "run" }),
              })
                .then(() => refresh())
                .catch((reason) =>
                  setError(reason instanceof Error ? reason.message : "Sync failed"),
                )
            }
          >
            Run Square sync now
          </button>
        </div>
      ) : null}

      {screen === "admin-review" || screen === "admin-leave" ? (
        <>
          <h1 className="time-title">{leaveOnly ? "Time Off & Absences" : "Review"}</h1>
          <p className="time-muted">
            {leaveOnly
              ? "Review employee absence and future time-off requests."
              : "Missed punches, forgotten clock-outs, correction requests, clarifications, and operational exceptions."}
          </p>
          <div className="time-admin-grid">
            <div className="time-admin-stack">
              {!leaveOnly
                ? operationalExceptions.map((exception, index) => (
                    <article
                      className="time-admin-card"
                      key={`${exception.type}:${exception.employeeId}:${index}`}
                    >
                      <strong>{exception.message}</strong>
                      <p className="time-muted">
                        {exception.type.replace(/_/g, " ")} · {exception.employeeId}
                      </p>
                    </article>
                  ))
                : null}
              {visibleQueue.map((item) => (
                <button
                  type="button"
                  className="time-admin-card time-admin-card-button"
                  key={`${item.kind}:${item.id}`}
                  onClick={() => void openRequest(item)}
                >
                  <strong>{item.summary}</strong>
                  <span>{item.kind.replace("_", " ")} · {item.state}</span>
                </button>
              ))}
              {!visibleQueue.length ? <p className="time-muted">Queue is clear.</p> : null}
            </div>
            {selectedRequest ? (
              <div className="time-admin-card">
                <h2>{selectedRequest.kind.replace("_", " ")}</h2>
                <dl className="time-admin-detail">
                  {Object.entries(selectedRequest.item)
                    .filter(([key]) => !["originalSnapshot", "id", "employeeId"].includes(key))
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{humanizeField(key)}</dt>
                        <dd>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</dd>
                      </div>
                    ))}
                </dl>
                {selectedRequest.messages.map((message, index) => (
                  <p className="time-admin-thread" key={index}>
                    <strong>{message.authorRole}:</strong> {message.body}
                  </p>
                ))}
                {selectedRequest.kind === "absence" ? (
                  <>
                    <select className="time-field" value={adminClass} onChange={(event) => setAdminClass(event.target.value)}>
                      <option value="unclassified">Unclassified</option>
                      <option value="sick">Sick</option>
                      <option value="vacation">Vacation</option>
                      <option value="personal">Personal</option>
                      <option value="pto">PTO</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                    {adminClass === "pto" || adminClass === "vacation" ? (
                      <input
                        className="time-field"
                        inputMode="decimal"
                        value={leaveHoursApplied}
                        onChange={(event) => setLeaveHoursApplied(event.target.value)}
                        placeholder="Leave hours to apply"
                      />
                    ) : null}
                  </>
                ) : null}
                {selectedRequest.kind === "correction" ? (
                  <input
                    className="time-field"
                    value={approvedCorrection}
                    onChange={(event) => setApprovedCorrection(event.target.value)}
                    placeholder="Approved correction"
                  />
                ) : null}
                <textarea
                  className="time-field"
                  rows={3}
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="Manager remark / clarification"
                />
                <div className="time-admin-actions">
                  <button type="button" onClick={() => void reviewRequest("approved")}>Approve</button>
                  <button type="button" onClick={() => void reviewRequest("needs_clarification")}>Ask employee</button>
                  <button type="button" className="danger" onClick={() => void reviewRequest("denied")}>Deny</button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {screen === "admin-employees" ? (
        <>
          <h1 className="time-title">Employees</h1>
          <p className="time-muted">Everyday Time setup, PIN help, trusted-device reset, and employee status.</p>
          <div className="time-admin-toolbar">
            <button type="button" onClick={() => setShowAdd((value) => !value)}>+ Add Employee</button>
            <a href="/time/pins">Secure PIN Entry</a>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" />
          </div>
          {showAdd ? (
            <form
              className="time-admin-card time-admin-form"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await adminApi("/api/time/admin/employees", {
                    method: "POST",
                    body: JSON.stringify(add),
                  });
                  setNotice(`Employee saved. Share ${onboardingUrl}`);
                  setShowAdd(false);
                  setAdd({
                    firstName: "", lastName: "", department: "", title: "", pin: "",
                    startDate: "", ptoEligible: false, vacationEligible: false,
                    role: "employee", notes: "",
                  });
                  await refresh();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "Could not add employee.");
                }
              }}
            >
              <input required placeholder="First name *" value={add.firstName} onChange={(event) => setAdd({ ...add, firstName: event.target.value })} />
              <input required placeholder="Last name *" value={add.lastName} onChange={(event) => setAdd({ ...add, lastName: event.target.value })} />
              <input required placeholder="Department *" value={add.department} onChange={(event) => setAdd({ ...add, department: event.target.value })} />
              <input placeholder="Job title / position" value={add.title} onChange={(event) => setAdd({ ...add, title: event.target.value })} />
              <input required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="4-digit PIN *" value={add.pin} onChange={(event) => setAdd({ ...add, pin: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
              <input type="date" value={add.startDate} onChange={(event) => setAdd({ ...add, startDate: event.target.value })} />
              <label><input type="checkbox" checked={add.ptoEligible} onChange={(event) => setAdd({ ...add, ptoEligible: event.target.checked })} /> PTO eligible</label>
              <label><input type="checkbox" checked={add.vacationEligible} onChange={(event) => setAdd({ ...add, vacationEligible: event.target.checked })} /> Vacation eligible</label>
              <select value={add.role} onChange={(event) => setAdd({ ...add, role: event.target.value })}>
                <option value="employee">Employee</option>
                <option value="timekeeping">Timekeeping helper</option>
              </select>
              <textarea rows={2} placeholder="Notes (optional)" value={add.notes} onChange={(event) => setAdd({ ...add, notes: event.target.value })} />
              <button type="submit">Save Employee</button>
              <p className="time-muted">PIN is hashed and cannot be retrieved later. Install: {onboardingUrl}</p>
            </form>
          ) : null}
          <div className="time-admin-stack">
            {filteredEmployees.map((employee) => (
              <article className="time-admin-card" key={employee.id}>
                <div className="time-admin-row">
                  <div>
                    <h2>{employee.firstName} {employee.lastName}</h2>
                    <p>{employee.department} · {employee.title || "No position"}</p>
                  </div>
                  <span className={`time-admin-status ${employee.setupStatus.toLowerCase()}`}>
                    {employee.setupStatus.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="time-muted">PIN: {employee.pinStatus === "configured" ? "Configured" : "Not set"} · Device: {employee.deviceStatus}</p>
                {employee.protected ? (
                  <p className="time-muted">Owner/security protected — PIN, device, and status changes blocked.</p>
                ) : null}
                <div className="time-admin-actions">
                  <button type="button" onClick={() => void viewTimecard(employee)}>View Timecard</button>
                  {!employee.protected ? (
                    <>
                      <button type="button" onClick={() => setSelectedEmployee(employee)}>Edit</button>
                      <button type="button" onClick={() => setNewPinFor(employee.id)}>Reset PIN</button>
                      <button type="button" onClick={() => void employeeAction(employee.id, "restart_onboarding")}>Reset Device</button>
                      <button
                        type="button"
                        className={employee.active ? "danger" : ""}
                        onClick={() => void employeeAction(employee.id, employee.active ? "deactivate" : "reactivate")}
                      >
                        {employee.active ? "Deactivate" : "Activate"}
                      </button>
                    </>
                  ) : null}
                </div>
                {newPinFor === employee.id ? (
                  <form
                    className="time-admin-inline"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void employeeAction(employee.id, "reset_pin", { pin: newPin });
                    }}
                  >
                    <input inputMode="numeric" pattern="\d{4}" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="New 4-digit PIN" />
                    <button type="submit">Save new PIN</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
          {selectedEmployee ? (
            <form
              className="time-admin-card time-admin-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void employeeAction(selectedEmployee.id, "update", {
                  firstName: form.get("firstName"),
                  lastName: form.get("lastName"),
                  department: form.get("department"),
                  title: form.get("title"),
                  startDate: form.get("startDate") || null,
                  ptoEligible: form.get("ptoEligible") === "on",
                  vacationEligible: form.get("vacationEligible") === "on",
                  role: form.get("role"),
                  notes: form.get("notes"),
                });
              }}
            >
              <h2>Edit {selectedEmployee.firstName}</h2>
              <input name="firstName" required defaultValue={selectedEmployee.firstName} />
              <input name="lastName" required defaultValue={selectedEmployee.lastName} />
              <input name="department" required defaultValue={selectedEmployee.department} />
              <input name="title" defaultValue={selectedEmployee.title} />
              <input name="startDate" type="date" defaultValue={selectedEmployee.startDate || ""} />
              <label><input name="ptoEligible" type="checkbox" defaultChecked={selectedEmployee.ptoEligible} /> PTO eligible</label>
              <label><input name="vacationEligible" type="checkbox" defaultChecked={selectedEmployee.vacationEligible} /> Vacation eligible</label>
              <select name="role" defaultValue={selectedEmployee.role === "timekeeping" ? "timekeeping" : "employee"}>
                <option value="employee">Employee</option>
                <option value="timekeeping">Timekeeping helper</option>
              </select>
              <textarea name="notes" rows={2} defaultValue={selectedEmployee.notes} />
              <button type="submit">Save changes</button>
              <button type="button" onClick={() => setSelectedEmployee(null)}>Cancel</button>
            </form>
          ) : null}
          {selectedTimecard ? (
            <div className="time-admin-card">
              <h2>Filtered timecard</h2>
              {selectedTimecard.shifts.map((shift) => (
                <p key={shift.id}>{new Date(shift.startAt).toLocaleString()} → {shift.endAt ? new Date(shift.endAt).toLocaleString() : "Open"} · {shift.status}</p>
              ))}
              {!selectedTimecard.shifts.length ? <p className="time-muted">No shifts yet.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {screen === "admin-payroll" ? (
        <>
          <h1 className="time-title">Payroll</h1>
          <p className="time-muted">
            Cleanup status before Michelle’s final payroll. Late-night hours stay inside Regular/OT totals.
          </p>
          <div className="time-admin-metrics">
            <div><strong>{payroll?.payrollReady ? "Ready" : "Not ready"}</strong><span>Current status</span></div>
            <div><strong>{payroll?.incompleteTimecards ?? 0}</strong><span>Incomplete timecards</span></div>
            <div><strong>{payroll?.unresolvedRequests ?? 0}</strong><span>Unresolved requests</span></div>
          </div>
          {payroll?.lateNightRule ? (
            <p className="time-admin-card">
              Late Night window: {payroll.lateNightRule.window}.{" "}
              {payroll.lateNightRule.feeConfigured
                ? `Fee $${payroll.lateNightRule.feeAmount} per occurrence.`
                : payroll.lateNightRule.note}
            </p>
          ) : null}
          {payroll?.currentPeriod ? (
            <p className="time-admin-card">Pay period {payroll.currentPeriod.startDate} – {payroll.currentPeriod.endDate} · {payroll.currentPeriod.status}</p>
          ) : null}
          <div className="time-admin-stack">
            {(payroll?.payPeriods || []).map((period) => (
              <article className="time-admin-card" key={period.id}>
                <div className="time-admin-row">
                  <div>
                    <h2>{period.startDate} → {period.endDate}</h2>
                    <p className="time-muted">{period.status}</p>
                  </div>
                  {owner && period.status !== "finalized" ? (
                    <button type="button" onClick={() => void finalizePayPeriod(period.id)}>
                      Finalize
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <div className="time-admin-stack">
            {(payroll?.employeeHours || []).map((row) => (
              <article className="time-admin-card" key={row.employeeId}>
                <h2>{row.employeeName}</h2>
                <dl className="time-admin-detail">
                  <div><dt>Regular Hours</dt><dd>{row.regularHours}</dd></div>
                  <div><dt>OT Hours</dt><dd>{row.overtimeHours}</dd></div>
                  <div><dt>Late Nights</dt><dd>{row.lateNightCount ?? 0}</dd></div>
                  <div>
                    <dt>Late Night Fee</dt>
                    <dd>
                      {row.lateNightFeeAmount == null
                        ? "Fee amount not set"
                        : `$${row.lateNightFeeAmount}`}
                    </dd>
                  </div>
                  <div><dt>PTO</dt><dd>{row.ptoHours ?? 0}h</dd></div>
                  <div><dt>Vacation</dt><dd>{row.vacationHours ?? 0}h</dd></div>
                </dl>
                {(row.lateNightOccurrences || []).length ? (
                  <div className="time-admin-thread">
                    {(row.lateNightOccurrences || []).map((occurrence) => (
                      <p key={occurrence.shiftId}>
                        Late Night · {occurrence.occurrenceDate} ·{" "}
                        {new Date(occurrence.shiftStartAt).toLocaleString()} →{" "}
                        {new Date(occurrence.shiftEndAt).toLocaleString()}
                      </p>
                    ))}
                  </div>
                ) : null}
                {row.incomplete ? <strong className="time-admin-warning">Needs cleanup</strong> : <span>Clean</span>}
              </article>
            ))}
          </div>
          {owner ? (
            <p className="time-muted">Owner finalize is available above. Paychex send stays off by default.</p>
          ) : (
            <p className="time-muted">Michelle finalizes pay periods after Shelly cleanup. Mason has security, not Paychex finalize.</p>
          )}
        </>
      ) : null}

      {screen === "admin-security" ? (
        canSecurity ? (
          <>
            <h1 className="time-title">Security</h1>
            <p className="time-muted">Device, IP/network, GPS/location, authentication, and suspected time-theft review signals. Never automatic accusations.</p>
            <div className="time-admin-stack">
              {authenticationAlerts.map((alert) => (
                <article className="time-admin-card" key={alert.id}>
                  <strong>{alert.severity} · Suspicious authentication</strong>
                  <p>{alert.summary}</p>
                  <p className="time-muted">Account key: {alert.target} · Last attempt {new Date(alert.lastAt).toLocaleString()}</p>
                </article>
              ))}
              {security.map((alert) => (
                <button className="time-admin-card time-admin-card-button" type="button" key={alert.id} onClick={() => void openSecurity(alert.id)}>
                  <strong>{alert.severity} · {alert.summary}</strong>
                </button>
              ))}
              {!security.length && !authenticationAlerts.length ? <p className="time-muted">Security queue is clear.</p> : null}
            </div>
            {selectedEvidence ? (
              <>
                <pre className="time-admin-evidence">{JSON.stringify(selectedEvidence, null, 2)}</pre>
                {typeof selectedEvidence.id === "string" ? (
                  <div className="time-admin-actions">
                    <button type="button" onClick={() => void acknowledgeSecurity(String(selectedEvidence.id))}>
                      Acknowledge reviewed
                    </button>
                    <button type="button" onClick={() => setSelectedEvidence(null)}>Close</button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <div className="time-error">Security is limited to Mason and Michelle.</div>
        )
      ) : null}
    </section>
  );
}
