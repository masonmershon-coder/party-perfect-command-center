import { randomUUID } from "node:crypto";
import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";
import type { AbsenceReason } from "@/lib/time/types";
import { ABSENCE_REASONS } from "@/lib/time/workflow";

const REASONS = new Set<AbsenceReason>(ABSENCE_REASONS);

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  return timePrivateJson({
    absences: await (await getTimeStore()).listAbsences(employee.id),
    reasons: ABSENCE_REASONS,
  });
}

export async function POST(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  if (!employee.capabilities.includes("self_request")) {
    return timePrivateJson({ error: "Forbidden" }, { status: 403 });
  }
  let body: {
    startDate?: string;
    endDate?: string;
    reason?: string;
    category?: string;
    employeeNote?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = (body.reason || body.category) as AbsenceReason;
  if (!REASONS.has(reason) || !body.startDate || !body.endDate) {
    return timePrivateJson({ error: "Choose dates and why you were gone." }, { status: 400 });
  }
  // Absence report is NOT an automatic PTO request. Eligibility never gates reporting.
  const now = new Date().toISOString();
  const row = await (await getTimeStore()).upsertAbsence({
    id: randomUUID(),
    employeeId: employee.id,
    startDate: String(body.startDate).slice(0, 10),
    endDate: String(body.endDate).slice(0, 10),
    reason,
    adminClass: "unclassified",
    paid: false,
    leaveHoursApplied: null,
    employeeNote: String(body.employeeNote || "").slice(0, 4000),
    managerRemark: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await (await getTimeStore()).appendAudit({
    at: now,
    actor: employee.id,
    action: "absence.request",
    target: row.id,
    detail: reason,
  });
  return timePrivateJson({
    absence: row,
    message: "Sent to Shelly for review.",
  });
}
