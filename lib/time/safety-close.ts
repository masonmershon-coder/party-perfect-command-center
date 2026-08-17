/**
 * Open-shift safety close — provisional, never employee-confirmed payroll time.
 */

import { randomUUID } from "node:crypto";
import { chicagoParts } from "@/lib/time/chicago";
import { lunchSeconds } from "@/lib/time/hours";
import type { TimeStore } from "@/lib/time/store";
import type { PunchEvent, TimeSettings, TimeShift } from "@/lib/time/types";
import { DEFAULT_TIME_SETTINGS, TIME_TZ, blankPunchEvidence } from "@/lib/time/types";

export function maxOpenShiftMs(settings: TimeSettings = DEFAULT_TIME_SETTINGS): number {
  return Math.max(1, settings.maxOpenShiftHours) * 3600 * 1000;
}

export function shiftNeedsSafetyClose(
  shift: TimeShift,
  at: Date,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): boolean {
  if (shift.status !== "open" && shift.status !== "on_lunch") return false;
  if (shift.closeKind === "system_pending_correction") return false;
  const age = at.getTime() - Date.parse(shift.startAt);
  return age >= maxOpenShiftMs(settings);
}

/**
 * Close an abnormally long open shift as SYSTEM_CLOSED_PENDING_CORRECTION.
 * Does not invent employee-confirmed worked hours. Idempotent.
 */
export async function safetyCloseShift(
  store: TimeStore,
  shift: TimeShift,
  at: Date,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): Promise<{ shift: TimeShift; created: boolean; punch: PunchEvent | null }> {
  if (shift.status === "pending_correction" || shift.closeKind === "system_pending_correction") {
    return { shift, created: false, punch: null };
  }
  if (shift.status !== "open" && shift.status !== "on_lunch") {
    return { shift, created: false, punch: null };
  }

  const nowIso = at.toISOString();
  const rule = `MAX_OPEN_SHIFT_HOURS=${settings.maxOpenShiftHours}`;
  const idempotencyKey = `system_safety_close:${shift.id}`;

  const existing = await store.getPunchByIdempotency(idempotencyKey);
  if (existing) {
    const current = (await store.getShift(shift.id)) || shift;
    return { shift: current, created: false, punch: existing };
  }

  const closed: TimeShift = {
    ...shift,
    endAt: nowIso,
    status: "pending_correction",
    closeKind: "system_pending_correction",
    hoursAuthority: "PENDING_CORRECTION",
    safetyClosedAt: nowIso,
    safetyCloseRule: rule,
    // Never treat safety-close as final paid time.
    paidSeconds: null,
    lunchSeconds: lunchSeconds(shift),
    employeeCorrectionId: shift.employeeCorrectionId,
  };

  const punch = blankPunchEvidence({
    id: randomUUID(),
    employeeId: shift.employeeId,
    type: "clock_out",
    occurredAt: nowIso,
    ingestedAt: nowIso,
    timezone: TIME_TZ,
    source: "system_safety_close",
    idempotencyKey,
    shiftId: shift.id,
    deviceHint: "system_safety_close",
    geofenceOk: false,
    geofenceReason: "system_safety_close",
    gpsPermission: "not_requested",
    reviewRequired: true,
    reasonCodes: [],
    riskScore: 0,
  });

  const inserted = await store.insertPunch(punch);
  if (inserted === "duplicate") {
    const again = await store.getPunchByIdempotency(idempotencyKey);
    const current = (await store.getShift(shift.id)) || closed;
    return { shift: current, created: false, punch: again };
  }

  await store.upsertShift(closed);
  await store.appendAudit({
    at: nowIso,
    actor: "system",
    action: "shift.system_closed_pending_correction",
    target: shift.id,
    detail: `${rule};original_start=${shift.startAt};safety_close=${nowIso}`,
  });

  return { shift: closed, created: true, punch };
}

/** Sweep all open shifts; safe to call on session/me/punch/admin/mike paths. */
export async function runOpenShiftSafetySweep(
  store: TimeStore,
  at = new Date(),
): Promise<{ closed: number }> {
  const settings = await store.getSettings();
  const shifts = await store.listShifts();
  let closed = 0;
  for (const s of shifts) {
    if (!shiftNeedsSafetyClose(s, at, settings)) continue;
    const result = await safetyCloseShift(store, s, at, settings);
    if (result.created) closed += 1;
  }
  // Optional overnight boundary: same sweep (age-based). Hour gate is for ops docs / future cron.
  void chicagoParts(at);
  void settings.overnightSafetyCheckHourChicago;
  return { closed };
}

export function isProvisionalSystemClose(shift: TimeShift): boolean {
  return (
    shift.status === "pending_correction" ||
    shift.closeKind === "system_pending_correction" ||
    shift.hoursAuthority === "PENDING_CORRECTION" ||
    shift.hoursAuthority === "SYSTEM_ESTIMATED"
  );
}
