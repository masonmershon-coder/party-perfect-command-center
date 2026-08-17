import { randomUUID } from "node:crypto";
import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";
import type { TimeOffReason } from "@/lib/time/types";
import { TIME_OFF_REASONS } from "@/lib/time/workflow";

const REASONS = new Set(TIME_OFF_REASONS.map((r) => r.id));

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  return timePrivateJson({
    timeOff: await (await getTimeStore()).listTimeOff(employee.id),
    reasons: TIME_OFF_REASONS,
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
    employeeNote?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = body.reason as TimeOffReason;
  if (!REASONS.has(reason) || !body.startDate || !body.endDate) {
    return timePrivateJson({ error: "Choose dates and a reason." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const row = await (await getTimeStore()).upsertTimeOff({
    id: randomUUID(),
    employeeId: employee.id,
    startDate: String(body.startDate).slice(0, 10),
    endDate: String(body.endDate).slice(0, 10),
    reason,
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
    action: "time_off.request",
    target: row.id,
    detail: reason,
  });
  return timePrivateJson({
    timeOff: row,
    message: "Sent to Shelly for review.",
  });
}
