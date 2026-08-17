import { chicagoLocalToUtc, chicagoParts, chicagoYmd } from "@/lib/time/chicago";
import type { LateNightOccurrence, TimeSettings, TimeShift } from "@/lib/time/types";
import { DEFAULT_TIME_SETTINGS } from "@/lib/time/types";

export function secondsBetween(startIso: string, endIso: string): number {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 1000);
}

export function lunchSeconds(shift: Pick<TimeShift, "lunchStartAt" | "lunchEndAt">): number {
  if (!shift.lunchStartAt || !shift.lunchEndAt) return 0;
  return secondsBetween(shift.lunchStartAt, shift.lunchEndAt);
}

export function paidSecondsForShift(
  shift: Pick<TimeShift, "startAt" | "endAt" | "lunchStartAt" | "lunchEndAt">,
  nowIso?: string,
): number {
  const end = shift.endAt || nowIso;
  if (!end) return 0;
  const gross = secondsBetween(shift.startAt, end);
  return Math.max(0, gross - lunchSeconds(shift));
}

export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function hoursFromSeconds(seconds: number): number {
  return Math.round((seconds / 3600) * 10000) / 10000;
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * True if the shift contains any worked time in the Late Night window
 * (default 7:00 PM–6:00 AM America/Chicago). One overnight shift = one check.
 */
export function shiftTouchesLateNightWindow(
  shift: Pick<TimeShift, "startAt" | "endAt" | "lunchStartAt" | "lunchEndAt">,
  settings: Pick<
    TimeSettings,
    "lateNightWindowStartHourChicago" | "lateNightWindowEndHourChicago"
  > = DEFAULT_TIME_SETTINGS,
): boolean {
  if (!shift.endAt) return false;
  const shiftStart = Date.parse(shift.startAt);
  const shiftEnd = Date.parse(shift.endAt);
  if (!Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd) || shiftEnd <= shiftStart) {
    return false;
  }

  const lunchStart = shift.lunchStartAt ? Date.parse(shift.lunchStartAt) : null;
  const lunchEnd = shift.lunchEndAt ? Date.parse(shift.lunchEndAt) : null;
  const startHour = settings.lateNightWindowStartHourChicago;
  const endHour = settings.lateNightWindowEndHourChicago;

  // Candidate window anchors: days covering the shift, plus previous day (window can start prior evening).
  const startParts = chicagoParts(new Date(shiftStart));
  const endParts = chicagoParts(new Date(shiftEnd));
  const [sy, sm, sd] = startParts.ymd.split("-").map(Number);
  const [ey, em, ed] = endParts.ymd.split("-").map(Number);
  const dayMs = 24 * 3600 * 1000;
  const first = chicagoLocalToUtc(sy, sm, sd, 0, 0, 0).getTime() - dayMs;
  const last = chicagoLocalToUtc(ey, em, ed, 0, 0, 0).getTime();

  for (let dayStart = first; dayStart <= last; dayStart += dayMs) {
    const ymd = chicagoYmd(new Date(dayStart + 12 * 3600 * 1000));
    const [y, m, d] = ymd.split("-").map(Number);
    const windowStart = chicagoLocalToUtc(y, m, d, startHour, 0, 0).getTime();
    const next = new Date(chicagoLocalToUtc(y, m, d, 12, 0, 0).getTime() + dayMs);
    const ny = chicagoYmd(next);
    const [yy, mm, dd] = ny.split("-").map(Number);
    const windowEnd = chicagoLocalToUtc(yy, mm, dd, endHour, 0, 0).getTime();
    if (!intervalsOverlap(shiftStart, shiftEnd, windowStart, windowEnd)) continue;

    // Exclude pure lunch overlap: if the only overlap is entirely inside lunch, ignore.
    if (
      lunchStart != null &&
      lunchEnd != null &&
      Number.isFinite(lunchStart) &&
      Number.isFinite(lunchEnd) &&
      lunchStart < lunchEnd
    ) {
      const overlapStart = Math.max(shiftStart, windowStart);
      const overlapEnd = Math.min(shiftEnd, windowEnd);
      if (overlapStart >= lunchStart && overlapEnd <= lunchEnd) continue;
    }
    return true;
  }
  return false;
}

/** At most one Late Night occurrence per shift, even when the shift crosses midnight. */
export function lateNightOccurrenceForShift(
  shift: Pick<
    TimeShift,
    "id" | "employeeId" | "startAt" | "endAt" | "lunchStartAt" | "lunchEndAt" | "status"
  >,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): LateNightOccurrence | null {
  if (shift.status !== "closed" || !shift.endAt) return null;
  if (!shiftTouchesLateNightWindow(shift, settings)) return null;
  return {
    shiftId: shift.id,
    employeeId: shift.employeeId,
    occurrenceDate: chicagoYmd(new Date(shift.startAt)),
    shiftStartAt: shift.startAt,
    shiftEndAt: shift.endAt,
  };
}

export function lateNightFeeTotal(
  occurrenceCount: number,
  feeAmount: number | null,
): number | null {
  if (feeAmount == null || !Number.isFinite(feeAmount)) return null;
  return Math.round(occurrenceCount * feeAmount * 100) / 100;
}
