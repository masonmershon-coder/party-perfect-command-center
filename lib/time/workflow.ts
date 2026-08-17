import { randomUUID } from "node:crypto";
import type { TimeStore } from "@/lib/time/store";
import type {
  AbsenceAdminClass,
  AbsenceReason,
  ApprovalState,
  CorrectionIssueType,
  RequestKind,
  RequestMessage,
  SecuritySeverity,
  TimeAbsence,
  TimeCorrection,
  TimeNotification,
  TimeOffReason,
  TimeOffRequest,
} from "@/lib/time/types";
import { computeSecuritySeverity, securityAlertSummary } from "@/lib/time/verify";

export const CORRECTION_ISSUES: { id: CorrectionIssueType; label: string }[] = [
  { id: "forgot_clock_in", label: "Forgot to clock in" },
  { id: "forgot_clock_out", label: "Forgot to clock out" },
  { id: "forgot_lunch_start", label: "Forgot to start lunch" },
  { id: "forgot_lunch_end", label: "Forgot to end lunch" },
  { id: "wrong_time", label: "Wrong time" },
  { id: "other", label: "Other" },
];

export const ABSENCE_REASONS: AbsenceReason[] = ["Sick", "Vacation", "Personal", "Other"];

export const TIME_OFF_REASONS: { id: TimeOffReason; label: string }[] = [
  { id: "doctors_appointment", label: "Doctor's appointment" },
  { id: "vacation", label: "Vacation" },
  { id: "personal_day", label: "Personal day" },
  { id: "other", label: "Other" },
];

/** Mason (primary) + Michelle (owner visibility). Never Shelly for routine security. */
export const SECURITY_OVERSIGHT_EMPLOYEE_IDS = ["emp-mason", "emp-michelle"] as const;

export function isOpenReviewState(state: ApprovalState): boolean {
  return state === "pending" || state === "needs_clarification";
}

export async function notifyEmployee(
  store: TimeStore,
  input: {
    employeeId: string;
    title: string;
    body: string;
    requestKind: RequestKind | null;
    requestId: string | null;
  },
): Promise<TimeNotification> {
  const row: TimeNotification = {
    id: randomUUID(),
    employeeId: input.employeeId,
    title: input.title,
    body: input.body,
    requestKind: input.requestKind,
    requestId: input.requestId,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await store.insertNotification(row);
  return row;
}

/**
 * Route security/anomaly alerts to Mason (primary) and Michelle (owner).
 * HIGH → both. MEDIUM → Mason only (Michelle sees in Security tab). LOW → no push.
 * Never notify Shelly for routine security signals.
 */
export async function notifySecurityOversight(
  store: TimeStore,
  input: {
    punchId: string;
    severity: SecuritySeverity;
    summary: string;
  },
): Promise<void> {
  if (input.severity === "LOW") return;
  const recipients =
    input.severity === "HIGH"
      ? SECURITY_OVERSIGHT_EMPLOYEE_IDS
      : (["emp-mason"] as const);
  const title =
    input.severity === "HIGH"
      ? "HIGH security review signal"
      : "Security review signal";
  for (const employeeId of recipients) {
    const emp = await store.getEmployee(employeeId);
    if (!emp?.active) continue;
    if (
      !emp.capabilities.includes("timekeeping.security") &&
      !emp.capabilities.includes("timekeeping.admin")
    ) {
      continue;
    }
    await notifyEmployee(store, {
      employeeId,
      title,
      body: `${input.summary} · Punch ${input.punchId}. Review signal only — not an accusation.`,
      requestKind: null,
      requestId: input.punchId,
    });
  }
}

export async function postRequestMessage(
  store: TimeStore,
  input: {
    requestKind: RequestKind;
    requestId: string;
    authorRole: RequestMessage["authorRole"];
    authorId: string;
    body: string;
  },
): Promise<RequestMessage> {
  const row: RequestMessage = {
    id: randomUUID(),
    requestKind: input.requestKind,
    requestId: input.requestId,
    authorRole: input.authorRole,
    authorId: input.authorId,
    body: input.body.slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
  await store.appendMessage(row);
  await store.appendAudit({
    at: row.createdAt,
    actor: input.authorId,
    action: `${input.requestKind}.message`,
    target: input.requestId,
    detail: input.authorRole,
  });
  return row;
}

export type ShellyQueueItem = {
  kind: RequestKind;
  id: string;
  employeeId: string;
  state: ApprovalState;
  queue: "shelly" | "michelle";
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type SecurityAlertItem = {
  kind: "security_alert";
  id: string;
  employeeId: string;
  severity: SecuritySeverity;
  summary: string;
  reasonCodes: string[];
  createdAt: string;
  /** Primary route: Mason. Owner visibility: Michelle. Never Shelly. */
  routeTo: "mason" | "michelle_visible";
};

/**
 * Shelly's operational cleanup queue only.
 * No punch security telemetry, IP, device-risk, or fraud scores.
 */
export async function buildShellyReviewQueue(store: TimeStore): Promise<{
  open: ShellyQueueItem[];
  awaitingClarification: ShellyQueueItem[];
  all: ShellyQueueItem[];
}> {
  const corrections = await store.listCorrections();
  const absences = await store.listAbsences();
  const timeOff = await store.listTimeOff();

  const requestItems: ShellyQueueItem[] = [
    ...corrections.map((c) => ({
      kind: "correction" as const,
      id: c.id,
      employeeId: c.employeeId,
      state: c.state,
      queue: c.queue,
      summary: `${c.issueType} · ${c.affectedDate}`,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    ...absences.map((a) => ({
      kind: "absence" as const,
      id: a.id,
      employeeId: a.employeeId,
      state: a.state,
      queue: a.queue,
      summary: `${a.reason} · ${a.startDate}–${a.endDate}`,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    ...timeOff.map((t) => ({
      kind: "time_off" as const,
      id: t.id,
      employeeId: t.employeeId,
      state: t.state,
      queue: t.queue,
      summary: `${t.reason} · ${t.startDate}–${t.endDate}`,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  ];

  const all = requestItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const open = all.filter((i) => i.queue === "shelly" && isOpenReviewState(i.state));
  const awaitingClarification = open.filter((i) => i.state === "needs_clarification");
  return { open, awaitingClarification, all };
}

/**
 * Mason primary / Michelle owner — security & time-theft review signals.
 * Open when reviewRequired and not yet acknowledged.
 */
export async function buildSecurityAlertQueue(store: TimeStore): Promise<{
  open: SecurityAlertItem[];
  high: SecurityAlertItem[];
  medium: SecurityAlertItem[];
  all: SecurityAlertItem[];
}> {
  const punches = await store.listPunches();
  const employees = await store.listEmployees();
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e?.preferredName || id;
  };

  const all: SecurityAlertItem[] = punches
    .filter((p) => p.reviewRequired && !p.reviewedAt && p.source === "app")
    .map((p) => {
      const severity = computeSecuritySeverity(p);
      return {
        kind: "security_alert" as const,
        id: p.id,
        employeeId: p.employeeId,
        severity,
        summary: securityAlertSummary(p, nameOf(p.employeeId)),
        reasonCodes: p.reasonCodes,
        createdAt: p.occurredAt,
        routeTo: severity === "HIGH" ? ("michelle_visible" as const) : ("mason" as const),
      };
    })
    .sort((a, b) => {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const d = rank[a.severity] - rank[b.severity];
      return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
    });

  return {
    open: all,
    high: all.filter((a) => a.severity === "HIGH"),
    medium: all.filter((a) => a.severity === "MEDIUM"),
    all,
  };
}

export async function applyLeaveHoursIfEligible(
  store: TimeStore,
  absence: TimeAbsence,
  hours: number,
  approvedBy: string,
): Promise<TimeAbsence> {
  if (hours <= 0) return absence;
  const employee = await store.getEmployee(absence.employeeId);
  if (!employee) return absence;
  const leaveType =
    absence.adminClass === "pto"
      ? "pto"
      : absence.adminClass === "vacation"
        ? "vacation"
        : null;
  if (!leaveType) return { ...absence, leaveHoursApplied: hours };
  if (leaveType === "pto" && !employee.ptoEligible) return absence;
  if (leaveType === "vacation" && !employee.vacationEligible) return absence;
  const banks = await store.listLeaveBanks(employee.id);
  let bank = banks.find((b) => b.type === leaveType);
  if (!bank) {
    bank = {
      id: randomUUID(),
      employeeId: employee.id,
      type: leaveType,
      grantedHours: 0,
      usedHours: 0,
    };
  }
  bank = { ...bank, usedHours: bank.usedHours + hours };
  await store.upsertLeaveBank(bank);
  await store.insertLeaveTransaction({
    id: randomUUID(),
    bankId: bank.id,
    employeeId: employee.id,
    type: leaveType,
    deltaHours: -hours,
    reason: `absence:${absence.id}`,
    approvedBy,
    at: new Date().toISOString(),
  });
  return { ...absence, leaveHoursApplied: hours, paid: true };
}

export function formatCorrectionNotice(c: TimeCorrection): { title: string; body: string } {
  const date = c.affectedDate;
  if (c.state === "approved") {
    return {
      title: `Your ${date} time correction was approved.`,
      body: c.approvedCorrection || c.requestedCorrection,
    };
  }
  if (c.state === "denied") {
    return {
      title: `Your ${date} time correction was denied.`,
      body: c.adminRemark || "Shelly reviewed this request.",
    };
  }
  if (c.state === "needs_clarification") {
    return {
      title: `Shelly needs more information about your ${date} time.`,
      body: c.adminRemark || "Please reply in Party Perfect Time.",
    };
  }
  return { title: "Time correction update", body: c.state };
}

export function formatAbsenceNotice(a: TimeAbsence): { title: string; body: string } {
  if (a.state === "approved") {
    return {
      title: `Your absence for ${a.startDate}–${a.endDate} was approved.`,
      body: a.managerRemark || a.reason,
    };
  }
  if (a.state === "denied") {
    return {
      title: `Your absence for ${a.startDate}–${a.endDate} was denied.`,
      body: a.managerRemark || "Shelly reviewed this request.",
    };
  }
  if (a.state === "needs_clarification") {
    return {
      title: `Shelly needs more information about your absence.`,
      body: a.managerRemark || "Please reply in Party Perfect Time.",
    };
  }
  return { title: "Absence update", body: a.state };
}

export function formatTimeOffNotice(t: TimeOffRequest): { title: string; body: string } {
  if (t.state === "approved") {
    return {
      title: `Your time-off request for ${t.startDate}–${t.endDate} was approved.`,
      body: t.managerRemark || t.reason,
    };
  }
  if (t.state === "denied") {
    return {
      title: `Your time-off request for ${t.startDate}–${t.endDate} was denied.`,
      body: t.managerRemark || "Shelly reviewed this request.",
    };
  }
  if (t.state === "needs_clarification") {
    return {
      title: `Shelly needs more information about your time-off request.`,
      body: t.managerRemark || "Please reply in Party Perfect Time.",
    };
  }
  return { title: "Time-off update", body: t.state };
}

export function parseAdminClass(v: string | undefined): AbsenceAdminClass {
  const ok: AbsenceAdminClass[] = [
    "unclassified",
    "sick",
    "vacation",
    "personal",
    "pto",
    "unpaid",
    "other",
  ];
  if (v && ok.includes(v as AbsenceAdminClass)) return v as AbsenceAdminClass;
  return "unclassified";
}
