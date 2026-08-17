import { randomUUID } from "node:crypto";
import { privateJson } from "@/lib/api-auth";
import { chicagoWeekBounds, chicagoYmd } from "@/lib/time/chicago";
import { getTimeStore } from "@/lib/time/deps";
import {
  lateNightFeeTotal,
  lateNightOccurrenceForShift,
  paidSecondsForShift,
} from "@/lib/time/hours";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { listExceptions } from "@/lib/time/punch";
import { DEFAULT_TIME_SETTINGS, type PayPeriod } from "@/lib/time/types";

export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "payroll");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const settings = {
    ...DEFAULT_TIME_SETTINGS,
    ...(await store.getSettings()),
  };
  const exceptions = await listExceptions(store);
  const periods = await store.listPayPeriods();
  const currentPeriod = periods.find((p) => p.status !== "finalized") ?? null;
  const employees = await store.listEmployees();
  const shifts = await store.listShifts();
  const absences = await store.listAbsences();
  const rows = employees.map((employee) => {
    const relevant = shifts.filter((shift) => {
      if (shift.employeeId !== employee.id || shift.status !== "closed" || !shift.endAt) return false;
      if (!currentPeriod) return true;
      const ymd = chicagoYmd(new Date(shift.startAt));
      return ymd >= currentPeriod.startDate && ymd <= currentPeriod.endDate;
    });
    const importedRegular = relevant.reduce((sum, shift) => sum + (shift.importedRegularHours ?? 0), 0);
    const importedOvertime = relevant.reduce((sum, shift) => sum + (shift.importedOvertimeHours ?? 0), 0);
    const weeklyHours = new Map<string, number>();
    for (const shift of relevant) {
      if (shift.importedRegularHours != null || shift.importedOvertimeHours != null) continue;
      const week = chicagoWeekBounds(new Date(shift.startAt));
      const key = week.start.toISOString();
      weeklyHours.set(key, (weeklyHours.get(key) ?? 0) + paidSecondsForShift(shift) / 3600);
    }
    const calculatedRegular = [...weeklyHours.values()].reduce(
      (sum, hours) => sum + Math.min(40, hours),
      0,
    );
    const calculatedOvertime = [...weeklyHours.values()].reduce(
      (sum, hours) => sum + Math.max(0, hours - 40),
      0,
    );
    const regularHours = importedRegular + calculatedRegular;
    const overtimeHours = importedOvertime + calculatedOvertime;

    const employeeAbsences = absences.filter(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.state === "approved" &&
        absence.paid &&
        (!currentPeriod ||
          (absence.startDate <= currentPeriod.endDate &&
            absence.endDate >= currentPeriod.startDate)),
    );
    const leaveHoursApplied = employeeAbsences.reduce(
      (sum, absence) => sum + (absence.leaveHoursApplied ?? 0),
      0,
    );
    const ptoHours = employeeAbsences
      .filter((absence) => absence.adminClass === "pto")
      .reduce((sum, absence) => sum + (absence.leaveHoursApplied ?? 0), 0);
    const vacationHours = employeeAbsences
      .filter((absence) => absence.adminClass === "vacation")
      .reduce((sum, absence) => sum + (absence.leaveHoursApplied ?? 0), 0);

    const lateNightOccurrences = relevant
      .map((shift) => lateNightOccurrenceForShift(shift, settings))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const lateNightCount = lateNightOccurrences.length;
    const lateNightFeeAmount = lateNightFeeTotal(lateNightCount, settings.lateNightFeeAmount);

    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      leaveHoursApplied: Math.round(leaveHoursApplied * 100) / 100,
      ptoHours: Math.round(ptoHours * 100) / 100,
      vacationHours: Math.round(vacationHours * 100) / 100,
      lateNightCount,
      lateNightDates: lateNightOccurrences.map((row) => row.occurrenceDate),
      lateNightOccurrences,
      lateNightFeeAmount,
      incomplete: exceptions.some((exception) => exception.employeeId === employee.id),
    };
  });
  return privateJson({
    exceptions,
    payPeriods: periods,
    currentPeriod,
    employeeHours: rows,
    lateNightRule: {
      window: "7:00 PM – 6:00 AM America/Chicago",
      feeAmount: settings.lateNightFeeAmount,
      feeConfigured: settings.lateNightFeeAmount != null,
      note:
        settings.lateNightFeeAmount == null
          ? "Late-night fee amount unresolved until Mason supplies the authoritative amount."
          : "Late-night fee is configured.",
    },
    unresolvedRequests: exceptions.filter((exception) =>
      [
        "pending_correction",
        "absence_awaiting_review",
        "time_off_awaiting_action",
        "unanswered_clarification",
      ].includes(exception.type),
    ).length,
    incompleteTimecards: exceptions.filter((exception) =>
      [
        "incomplete_timecard",
        "open_lunch",
        "system_closed_pending_correction",
        "impossible_sequence",
      ].includes(exception.type),
    ).length,
    payrollReady: exceptions.length === 0 && periods.some((p) => p.status === "review"),
    paychexSend: false,
    finalAuthority: "Michelle",
  });
}

export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "owner");
  if (isTimeAdminError(gate)) return gate;
  let body: {
    action?: string;
    id?: string;
    startDate?: string;
    endDate?: string;
    status?: PayPeriod["status"];
    lateNightFeeAmount?: number | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const store = await getTimeStore();

  if (body.action === "configure_late_night_fee") {
    if (body.lateNightFeeAmount != null) {
      const amount = Number(body.lateNightFeeAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return privateJson({ error: "Late-night fee must be a non-negative number." }, { status: 400 });
      }
    }
    const existing = await store.getSettings();
    const saved = await store.upsertSettings({
      ...DEFAULT_TIME_SETTINGS,
      ...existing,
      lateNightFeeAmount:
        body.lateNightFeeAmount == null ? null : Number(body.lateNightFeeAmount),
    });
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: gate.actor,
      action: "settings.late_night_fee",
      target: "time_settings",
      detail: saved.lateNightFeeAmount == null ? "fee_unresolved" : "fee_configured",
    });
    return privateJson({ settings: saved });
  }

  if (body.action === "create") {
    if (!body.startDate || !body.endDate) {
      return privateJson({ error: "Pay period dates required." }, { status: 400 });
    }
    const row = await store.upsertPayPeriod({
      id: randomUUID(),
      startDate: body.startDate.slice(0, 10),
      endDate: body.endDate.slice(0, 10),
      status: "open",
      finalizedBy: null,
      finalizedAt: null,
    });
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: gate.actor,
      action: "pay_period.create",
      target: row.id,
      detail: `${row.startDate}..${row.endDate}`,
    });
    return privateJson({ payPeriod: row });
  }
  if (!body.id) return privateJson({ error: "Missing id" }, { status: 400 });
  const existing = (await store.listPayPeriods()).find((p) => p.id === body.id);
  if (!existing) return privateJson({ error: "Not found" }, { status: 404 });
  if (existing.status === "finalized") {
    return privateJson({ error: "This pay period is finalized and cannot be rewritten." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const next: PayPeriod = {
    ...existing,
    status: body.action === "finalize" ? "finalized" : body.status || existing.status,
    finalizedBy: body.action === "finalize" ? gate.actor : existing.finalizedBy,
    finalizedAt: body.action === "finalize" ? now : existing.finalizedAt,
  };
  const saved = await store.upsertPayPeriod(next);
  await store.appendAudit({
    at: now,
    actor: gate.actor,
    action: body.action === "finalize" ? "pay_period.finalize" : "pay_period.patch",
    target: saved.id,
    detail: saved.status,
  });
  return privateJson({ payPeriod: saved });
}
