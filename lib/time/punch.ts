import { randomUUID } from "node:crypto";
import { chicagoDayBounds, chicagoLocalToUtc, chicagoWeekBounds, inRange } from "@/lib/time/chicago";
import { lunchSeconds, paidSecondsForShift } from "@/lib/time/hours";
import { runOpenShiftSafetySweep } from "@/lib/time/safety-close";
import { emptyShiftFields, type TimeStore } from "@/lib/time/store";
import { TIME_TZ } from "@/lib/time/types";
import type {
  ClockStatus,
  GeofenceInput,
  GpsPermissionState,
  NetworkClass,
  PunchEvent,
  PunchType,
  TimeEmployee,
  TimeShift,
  TrustedDevice,
} from "@/lib/time/types";
import { evaluatePunchEvidence, computeSecuritySeverity, securityAlertSummary } from "@/lib/time/verify";
import { notifySecurityOversight } from "@/lib/time/workflow";

export type PunchResult =
  | { ok: true; duplicate: boolean; punch: PunchEvent; shift: TimeShift; status: ClockStatus }
  | { ok: false; error: string; code: string; status?: number };

export function clockStatusFromShift(shift: TimeShift | null): ClockStatus {
  if (!shift) return "NOT_CLOCKED_IN";
  if (shift.status === "closed" || shift.status === "pending_correction" || shift.status === "exception") {
    return "NOT_CLOCKED_IN";
  }
  if (shift.status === "on_lunch") return "ON_LUNCH";
  return "CLOCKED_IN";
}

export function nextAllowedPunches(status: ClockStatus): PunchType[] {
  if (status === "NOT_CLOCKED_IN") return ["clock_in"];
  if (status === "ON_LUNCH") return ["lunch_end"];
  return ["lunch_start", "clock_out"];
}

export async function openShiftFor(store: TimeStore, employeeId: string): Promise<TimeShift | null> {
  const shifts = await store.listShifts(employeeId);
  return shifts.find((s) => s.status === "open" || s.status === "on_lunch") ?? null;
}

/**
 * Record a punch.
 * App punches require a one-shot GPS capture at the punch moment (never continuous tracking).
 * Geofence / network / device remain EVIDENCE + REVIEW SIGNALS — job-site punches stay allowed.
 */
export async function recordPunch(
  store: TimeStore,
  input: {
    employee: TimeEmployee;
    type: PunchType;
    geo: GeofenceInput | null;
    gpsPermission?: GpsPermissionState;
    clientReportedAt?: string | null;
    clientIp?: string | null;
    networkClass?: NetworkClass;
    officeNetworkMatch?: boolean | null;
    trustedDevice?: TrustedDevice | null;
    deviceKnown?: boolean;
    newDevice?: boolean;
    idempotencyKey: string;
    now?: Date;
    deviceHint?: string | null;
    /** @deprecated Geofence is never a hard gate for app punches. Kept for call-site compat. */
    skipGeofence?: boolean;
    source?: PunchEvent["source"];
  },
): Promise<PunchResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const source = input.source || "app";

  await runOpenShiftSafetySweep(store, now);

  const existing = await store.getPunchByIdempotency(input.idempotencyKey);
  if (existing) {
    const shift = existing.shiftId ? await store.getShift(existing.shiftId) : await openShiftFor(store, input.employee.id);
    return {
      ok: true,
      duplicate: true,
      punch: existing,
      shift: shift || {
        id: "dup",
        employeeId: input.employee.id,
        startAt: existing.occurredAt,
        endAt: null,
        lunchStartAt: null,
        lunchEndAt: null,
        status: "open",
        paidSeconds: null,
        lunchSeconds: null,
        source: "app",
        payPeriodId: null,
        importedRegularHours: null,
        importedOvertimeHours: null,
        importedDoubletimeHours: null,
        ...emptyShiftFields(),
      },
      status: clockStatusFromShift(shift),
    };
  }

  if (!input.employee.active) {
    return { ok: false, error: "This login is no longer active.", code: "inactive", status: 403 };
  }

  // App punches only: require lat/lng captured at this tap. Never invent coordinates.
  if (
    source === "app" &&
    (input.geo == null ||
      !Number.isFinite(input.geo.latitude) ||
      !Number.isFinite(input.geo.longitude))
  ) {
    return {
      ok: false,
      error:
        "Location is required to record your time. Please allow location access to continue.",
      code: "location_required",
      status: 400,
    };
  }

  const open = await openShiftFor(store, input.employee.id);
  const status = clockStatusFromShift(open);
  if (!nextAllowedPunches(status).includes(input.type)) {
    return { ok: false, error: "That punch is not allowed right now.", code: "invalid_sequence", status: 409 };
  }

  const periods = await store.listPayPeriods();
  const finalized = periods.find((p) => {
    if (p.status !== "finalized") return false;
    const [sy, sm, sd] = p.startDate.split("-").map(Number);
    const [ey, em, ed] = p.endDate.split("-").map(Number);
    const start = chicagoLocalToUtc(sy, sm, sd, 0, 0, 0);
    const endExclusive = new Date(chicagoLocalToUtc(ey, em, ed, 0, 0, 0).getTime() + 86400000);
    return inRange(nowIso, start, endExclusive);
  });
  if (finalized && input.source !== "import") {
    return { ok: false, error: "This pay period is finalized and cannot be rewritten.", code: "finalized", status: 409 };
  }

  let shift = open;
  if (input.type === "clock_in") {
    shift = {
      id: randomUUID(),
      employeeId: input.employee.id,
      startAt: nowIso,
      endAt: null,
      lunchStartAt: null,
      lunchEndAt: null,
      status: "open",
      paidSeconds: null,
      lunchSeconds: null,
      source: input.source || "app",
      payPeriodId: null,
      importedRegularHours: null,
      importedOvertimeHours: null,
      importedDoubletimeHours: null,
      ...emptyShiftFields(),
    };
  } else if (!shift) {
    return { ok: false, error: "No open shift.", code: "no_shift", status: 409 };
  } else if (input.type === "lunch_start") {
    shift = { ...shift, lunchStartAt: nowIso, status: "on_lunch" };
  } else if (input.type === "lunch_end") {
    shift = { ...shift, lunchEndAt: nowIso, status: "open" };
  } else if (input.type === "clock_out") {
    shift = {
      ...shift,
      endAt: nowIso,
      status: "closed",
      closeKind: "employee",
      hoursAuthority: "EMPLOYEE_CONFIRMED",
      lunchSeconds: lunchSeconds(shift),
      paidSeconds: paidSecondsForShift({ ...shift, endAt: nowIso }, nowIso),
    };
  }

  const locations = await store.listLocations();
  const priorPunches = await store.listPunches(input.employee.id);
  const devices = await store.listTrustedDevices(input.employee.id);
  const activeDeviceCount = devices.filter((d) => d.active && !d.revokedAt).length;

  const gpsPermission: GpsPermissionState =
    input.gpsPermission ||
    (input.geo ? "granted" : input.source === "import" ? "import" : "unavailable");

  const evidence = evaluatePunchEvidence({
    geo: input.geo,
    gpsPermission,
    clientReportedAt: input.clientReportedAt ?? null,
    clientIp: input.clientIp ?? null,
    networkClass: input.networkClass ?? "UNKNOWN",
    officeNetworkMatch: input.officeNetworkMatch ?? null,
    device: input.trustedDevice ?? null,
    deviceKnown: Boolean(input.deviceKnown),
    newDevice: Boolean(input.newDevice),
    deviceHint: input.deviceHint ? String(input.deviceHint).slice(0, 80) : null,
    priorPunches,
    activeDeviceCount,
    locations,
    now,
  });

  const punch: PunchEvent = {
    id: randomUUID(),
    employeeId: input.employee.id,
    type: input.type,
    occurredAt: nowIso,
    ingestedAt: nowIso,
    timezone: TIME_TZ,
    clientReportedAt: evidence.clientReportedAt,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracyM: evidence.accuracyM,
    gpsCapturedAt: evidence.gpsCapturedAt,
    gpsPermission: evidence.gpsPermission,
    locationId: evidence.locationId,
    nearestLocationId: evidence.nearestLocationId,
    nearestLocationName: evidence.nearestLocationName,
    distanceFromNearestM: evidence.distanceFromNearestM,
    geofenceOk: evidence.geofenceOk,
    geofenceReason: evidence.geofenceReason,
    clientIp: evidence.clientIp,
    networkClass: evidence.networkClass,
    officeNetworkMatch: evidence.officeNetworkMatch,
    trustedDeviceId: evidence.trustedDeviceId,
    trustedDevice: evidence.trustedDevice,
    newDevice: evidence.newDevice,
    unusualIp: evidence.unusualIp,
    unusualLocation: evidence.unusualLocation,
    riskScore: evidence.riskScore,
    reviewRequired: evidence.reviewRequired,
    reasonCodes: evidence.reasonCodes,
    reviewedAt: null,
    reviewedBy: null,
    source: input.source || "app",
    idempotencyKey: input.idempotencyKey.slice(0, 160),
    shiftId: shift.id,
    deviceHint: evidence.deviceHint,
  };

  const inserted = await store.insertPunch(punch);
  if (inserted === "duplicate") {
    const again = await store.getPunchByIdempotency(input.idempotencyKey);
    return {
      ok: true,
      duplicate: true,
      punch: again || punch,
      shift,
      status: clockStatusFromShift(shift),
    };
  }
  await store.upsertShift(shift);
  await store.appendAudit({
    at: nowIso,
    actor: input.employee.id,
    action: `punch.${input.type}`,
    target: punch.id,
    detail: punch.reviewRequired ? `review:${punch.reasonCodes.join(",")}` : shift.id,
  });
  if (punch.reviewRequired) {
    const severity = computeSecuritySeverity(punch);
    const summary = securityAlertSummary(punch, input.employee.preferredName);
    await store.appendAudit({
      at: nowIso,
      actor: "system",
      action: "punch.verification_flagged",
      target: punch.id,
      detail: `mason_security:${severity}:${punch.reasonCodes.join(",")}:score=${punch.riskScore}`,
    });
    await notifySecurityOversight(store, {
      punchId: punch.id,
      severity,
      summary,
    });
  }
  return { ok: true, duplicate: false, punch, shift, status: clockStatusFromShift(shift) };
}

export async function acknowledgePunchVerification(
  store: TimeStore,
  punchId: string,
  actorId: string,
): Promise<PunchEvent | null> {
  const punches = await store.listPunches();
  const punch = punches.find((p) => p.id === punchId);
  if (!punch) return null;
  const updated: PunchEvent = {
    ...punch,
    reviewRequired: false,
    reviewedAt: new Date().toISOString(),
    reviewedBy: actorId,
  };
  await store.updatePunch(updated);
  await store.appendAudit({
    at: updated.reviewedAt!,
    actor: actorId,
    action: "punch.verification_acked",
    target: punchId,
    detail: "security_oversight",
  });
  return updated;
}

export async function hoursSummary(store: TimeStore, employeeId: string, at = new Date()) {
  const day = chicagoDayBounds(at);
  const week = chicagoWeekBounds(at);
  const shifts = await store.listShifts(employeeId);
  const nowIso = at.toISOString();
  let today = 0;
  let weekSec = 0;
  for (const s of shifts) {
    if (s.hoursAuthority === "PENDING_CORRECTION" || s.hoursAuthority === "SYSTEM_ESTIMATED") continue;
    if (s.status === "pending_correction") continue;
    const paid = paidSecondsForShift(s, nowIso);
    if (inRange(s.startAt, day.start, day.end) || (s.endAt && inRange(s.endAt, day.start, day.end))) {
      today += paid;
    }
    if (inRange(s.startAt, week.start, week.end)) weekSec += paid;
  }
  return { todaySeconds: today, weekSeconds: weekSec, timezone: "America/Chicago" };
}

export type TimeException = {
  type: string;
  employeeId: string;
  shiftId: string | null;
  message: string;
};

export async function listExceptions(store: TimeStore, at = new Date()): Promise<TimeException[]> {
  await runOpenShiftSafetySweep(store, at);
  const out: TimeException[] = [];
  const shifts = await store.listShifts();
  const corrections = await store.listCorrections();
  const absences = await store.listAbsences();
  const timeOff = await store.listTimeOff();
  const settings = await store.getSettings();
  const now = at.getTime();
  const maxMs = settings.maxOpenShiftHours * 3600 * 1000;

  for (const s of shifts) {
    if (s.status === "pending_correction") {
      out.push({
        type: "system_closed_pending_correction",
        employeeId: s.employeeId,
        shiftId: s.id,
        message: s.employeeCorrectionId
          ? "System-closed shift — employee correction pending Shelly"
          : "System-closed shift — waiting for employee forgotten clock-out",
      });
    }
    const start = Date.parse(s.startAt);
    if ((s.status === "open" || s.status === "on_lunch") && now - start > maxMs) {
      out.push({
        type: "incomplete_timecard",
        employeeId: s.employeeId,
        shiftId: s.id,
        message: `Open shift longer than ${settings.maxOpenShiftHours} hours`,
      });
    }
    if (s.status === "on_lunch" && s.lunchStartAt && now - Date.parse(s.lunchStartAt) > 3 * 3600 * 1000) {
      out.push({ type: "open_lunch", employeeId: s.employeeId, shiftId: s.id, message: "Lunch open longer than 3 hours" });
    }
    if (s.status === "exception") {
      out.push({ type: "impossible_sequence", employeeId: s.employeeId, shiftId: s.id, message: "Shift flagged exception" });
    }
  }
  // Security/anomaly punches are Mason/Michelle — not Shelly ops exceptions.
  for (const c of corrections.filter((c) => c.state === "pending" || c.state === "needs_clarification")) {
    out.push({
      type: c.state === "needs_clarification" ? "unanswered_clarification" : "pending_correction",
      employeeId: c.employeeId,
      shiftId: c.shiftId,
      message: c.issueType,
    });
  }
  for (const a of absences.filter((a) => a.state === "pending" || a.state === "needs_clarification")) {
    out.push({
      type: a.state === "needs_clarification" ? "unanswered_clarification" : "absence_awaiting_review",
      employeeId: a.employeeId,
      shiftId: null,
      message: a.reason,
    });
  }
  for (const t of timeOff.filter((t) => t.state === "pending" || t.state === "needs_clarification")) {
    out.push({
      type: t.state === "needs_clarification" ? "unanswered_clarification" : "time_off_awaiting_action",
      employeeId: t.employeeId,
      shiftId: null,
      message: t.reason,
    });
  }
  return out;
}
