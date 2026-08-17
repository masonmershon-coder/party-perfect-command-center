import { randomUUID } from "node:crypto";
import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, mePayloadFor, requireTimeEmployee } from "@/lib/time/http";
import { chicagoYmd } from "@/lib/time/chicago";
import type { CorrectionIssueType } from "@/lib/time/types";
import { CORRECTION_ISSUES } from "@/lib/time/workflow";

const ISSUES = new Set(CORRECTION_ISSUES.map((i) => i.id));

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  const rows = await (await getTimeStore()).listCorrections(employee.id);
  return timePrivateJson({ corrections: rows, issueTypes: CORRECTION_ISSUES });
}

export async function POST(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  if (!employee.capabilities.includes("self_request")) {
    return timePrivateJson({ error: "Forbidden" }, { status: 403 });
  }
  let body: {
    shiftId?: string;
    punchId?: string;
    affectedDate?: string;
    issueType?: string;
    requestedCorrection?: string;
    employeeExplanation?: string;
    /** Forgotten clock-out after system safety close */
    forgottenClockOut?: boolean;
    requestedFinishAt?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const store = await getTimeStore();
  const now = new Date().toISOString();

  if (body.forgottenClockOut) {
    const shiftId = String(body.shiftId || "");
    const finishAt = String(body.requestedFinishAt || "").trim();
    const explanation = String(body.employeeExplanation || "").trim();
    if (!shiftId || !finishAt || !explanation) {
      return timePrivateJson(
        { error: "Tell us what time you finished and what happened." },
        { status: 400 },
      );
    }
    const shift = await store.getShift(shiftId);
    if (!shift || shift.employeeId !== employee.id) {
      return timePrivateJson({ error: "Shift not found." }, { status: 404 });
    }
    if (shift.status !== "pending_correction" || shift.closeKind !== "system_pending_correction") {
      return timePrivateJson({ error: "That shift does not need this fix." }, { status: 409 });
    }
    if (shift.employeeCorrectionId) {
      return timePrivateJson({ error: "You already sent this to Shelly." }, { status: 409 });
    }
    const finishMs = Date.parse(finishAt);
    if (!Number.isFinite(finishMs)) {
      return timePrivateJson({ error: "That finish time does not look right." }, { status: 400 });
    }
    if (finishMs < Date.parse(shift.startAt)) {
      return timePrivateJson({ error: "Finish time cannot be before you clocked in." }, { status: 400 });
    }

    const punches = await store.listPunches(employee.id);
    const shiftPunches = punches.filter((p) => p.shiftId === shift.id);
    const row = await store.upsertCorrection({
      id: randomUUID(),
      employeeId: employee.id,
      shiftId: shift.id,
      punchId: shiftPunches.find((p) => p.source === "system_safety_close")?.id || null,
      affectedDate: chicagoYmd(new Date(shift.startAt)),
      issueType: "forgot_clock_out",
      requestedCorrection: `Requested clock-out: ${new Date(finishMs).toISOString()}`,
      employeeExplanation: explanation.slice(0, 4000),
      adminRemark: "",
      approvedCorrection: "",
      state: "pending",
      queue: "shelly",
      decidedBy: null,
      decidedAt: null,
      originalSnapshot: JSON.stringify({
        kind: "system_closed_pending_correction",
        shift,
        punches: shiftPunches,
        requestedFinishAt: new Date(finishMs).toISOString(),
        safetyClosedAt: shift.safetyClosedAt,
        safetyCloseRule: shift.safetyCloseRule,
      }),
      createdAt: now,
      updatedAt: now,
    });
    await store.upsertShift({ ...shift, employeeCorrectionId: row.id });
    await store.appendAudit({
      at: now,
      actor: employee.id,
      action: "correction.forgotten_clock_out_request",
      target: row.id,
      detail: `shift=${shift.id};requested=${new Date(finishMs).toISOString()}`,
    });
    return timePrivateJson({
      correction: row,
      message: "Sent to Shelly for review.",
      me: await mePayloadFor(employee),
    });
  }

  const issueType = body.issueType as CorrectionIssueType;
  const explanation = String(body.employeeExplanation || "").trim();
  const requested = String(body.requestedCorrection || "").trim();
  const affectedDate = String(body.affectedDate || "").slice(0, 10);
  if (!ISSUES.has(issueType) || !explanation || !requested || !/^\d{4}-\d{2}-\d{2}$/.test(affectedDate)) {
    return timePrivateJson(
      { error: "Choose what happened, the date, the change you need, and a short note." },
      { status: 400 },
    );
  }
  const punches = await store.listPunches(employee.id);
  const shifts = await store.listShifts(employee.id);
  const dayPunches = punches.filter(
    (p) => p.occurredAt.slice(0, 10) === affectedDate || p.occurredAt.includes(affectedDate),
  );
  const row = await store.upsertCorrection({
    id: randomUUID(),
    employeeId: employee.id,
    shiftId: body.shiftId || null,
    punchId: body.punchId || null,
    affectedDate,
    issueType,
    requestedCorrection: requested.slice(0, 2000),
    employeeExplanation: explanation.slice(0, 4000),
    adminRemark: "",
    approvedCorrection: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    originalSnapshot: JSON.stringify({ punches: dayPunches, shifts: shifts.slice(0, 5) }),
    createdAt: now,
    updatedAt: now,
  });
  await store.appendAudit({
    at: now,
    actor: employee.id,
    action: "correction.request",
    target: row.id,
    detail: `${row.issueType}@${row.affectedDate}`,
  });
  return timePrivateJson({
    correction: row,
    message: "Sent to Shelly for review.",
  });
}
