/**
 * Mason fact-check over imported Time records — answers from store only, never invented.
 */
import { chicagoYmd } from "@/lib/time/chicago";
import { lateNightOccurrenceForShift, paidSecondsForShift } from "@/lib/time/hours";
import type { TimeStore } from "@/lib/time/store";
import { DEFAULT_TIME_SETTINGS } from "@/lib/time/types";

export type FactCheckQuery = {
  kind:
    | "hours_in_week"
    | "clock_in_on_date"
    | "lunch_on_date"
    | "ot_in_week"
    | "late_nights"
    | "who_worked_on_date"
    | "open_clock_outs"
    | "shift_count_year"
    | "employee_day";
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  date?: string; // YYYY-MM-DD Chicago
  weekStart?: string;
  weekEnd?: string;
  year?: number;
};

function weekBounds(weekStart: string): { start: string; end: string } {
  const start = `${weekStart}T00:00:00.000Z`;
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = chicagoYmd(d);
  return { start, end: `${end}T23:59:59.999Z` };
}

async function resolveEmployee(
  store: TimeStore,
  q: FactCheckQuery,
) {
  if (q.employeeId) return store.getEmployee(q.employeeId);
  if (q.firstName && q.lastName) {
    const hits = await store.findEmployeesByName(q.firstName, q.lastName);
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

export async function answerFactCheck(store: TimeStore, query: FactCheckQuery) {
  const settings = { ...DEFAULT_TIME_SETTINGS, ...(await store.getSettings()) };

  if (query.kind === "who_worked_on_date") {
    if (!query.date) return { ok: false as const, error: "date required (YYYY-MM-DD)" };
    const shifts = await store.listShifts();
    const day = shifts.filter((s) => chicagoYmd(new Date(s.startAt)) === query.date);
    const employees = await store.listEmployees();
    const byId = new Map(employees.map((e) => [e.id, e]));
    return {
      ok: true as const,
      kind: query.kind,
      date: query.date,
      count: day.length,
      rows: day.map((s) => {
        const e = byId.get(s.employeeId);
        return {
          shiftId: s.id,
          employeeId: s.employeeId,
          name: e ? `${e.firstName} ${e.lastName}` : s.employeeId,
          clockIn: s.startAt,
          clockOut: s.endAt,
          lunchStart: s.lunchStartAt,
          lunchEnd: s.lunchEndAt,
          status: s.status,
          source: s.source,
        };
      }),
    };
  }

  if (query.kind === "open_clock_outs") {
    const shifts = (await store.listShifts()).filter(
      (s) => s.status === "open" || s.status === "on_lunch" || !s.endAt,
    );
    return {
      ok: true as const,
      kind: query.kind,
      count: shifts.length,
      rows: shifts.map((s) => ({
        shiftId: s.id,
        employeeId: s.employeeId,
        clockIn: s.startAt,
        status: s.status,
        source: s.source,
      })),
    };
  }

  const employee = await resolveEmployee(store, query);
  if (!employee && query.kind !== "who_worked_on_date") {
    return { ok: false as const, error: "employee not found (need unique name or employeeId)" };
  }

  const shifts = employee ? await store.listShifts(employee.id) : [];
  const punches = employee ? await store.listPunches(employee.id) : [];

  if (query.kind === "shift_count_year") {
    const year = query.year ?? 2026;
    const matched = shifts.filter((s) => s.startAt.startsWith(String(year)));
    return {
      ok: true as const,
      kind: query.kind,
      employeeId: employee!.id,
      name: `${employee!.firstName} ${employee!.lastName}`,
      year,
      shiftCount: matched.length,
      shiftIds: matched.map((s) => s.id),
    };
  }

  if (query.kind === "clock_in_on_date" || query.kind === "lunch_on_date" || query.kind === "employee_day") {
    if (!query.date) return { ok: false as const, error: "date required" };
    const dayShifts = shifts.filter((s) => chicagoYmd(new Date(s.startAt)) === query.date);
    const dayPunches = punches.filter((p) => chicagoYmd(new Date(p.occurredAt)) === query.date);
    return {
      ok: true as const,
      kind: query.kind,
      employeeId: employee!.id,
      name: `${employee!.firstName} ${employee!.lastName}`,
      date: query.date,
      shifts: dayShifts.map((s) => ({
        shiftId: s.id,
        clockIn: s.startAt,
        clockOut: s.endAt,
        lunchStart: s.lunchStartAt,
        lunchEnd: s.lunchEndAt,
        status: s.status,
        source: s.source,
      })),
      punches: dayPunches.map((p) => ({
        punchId: p.id,
        type: p.type,
        occurredAt: p.occurredAt,
        source: p.source,
        shiftId: p.shiftId,
      })),
    };
  }

  if (query.kind === "hours_in_week" || query.kind === "ot_in_week" || query.kind === "late_nights") {
    if (!query.weekStart) return { ok: false as const, error: "weekStart required (YYYY-MM-DD)" };
    const { start, end } = weekBounds(query.weekStart);
    const endDate = query.weekEnd ? `${query.weekEnd}T23:59:59.999Z` : end;
    const inWeek = shifts.filter(
      (s) => s.startAt >= start && s.startAt <= endDate && s.status === "closed" && s.endAt,
    );
    let paid = 0;
    const late: ReturnType<typeof lateNightOccurrenceForShift>[] = [];
    for (const s of inWeek) {
      paid +=
        s.paidSeconds ??
        paidSecondsForShift({
          startAt: s.startAt,
          endAt: s.endAt,
          lunchStartAt: s.lunchStartAt,
          lunchEndAt: s.lunchEndAt,
        }) ??
        0;
      const ln = lateNightOccurrenceForShift(s, settings);
      if (ln) late.push(ln);
    }
    const regularCap = 40 * 3600;
    const regular = Math.min(paid, regularCap);
    const ot = Math.max(0, paid - regularCap);
    return {
      ok: true as const,
      kind: query.kind,
      employeeId: employee!.id,
      name: `${employee!.firstName} ${employee!.lastName}`,
      weekStart: query.weekStart,
      weekEnd: query.weekEnd || endDate.slice(0, 10),
      shiftIds: inWeek.map((s) => s.id),
      paidHours: Number((paid / 3600).toFixed(2)),
      regularHours: Number((regular / 3600).toFixed(2)),
      overtimeHours: Number((ot / 3600).toFixed(2)),
      lateNightCount: late.length,
      lateNightOccurrences: late,
      importedOtSum: inWeek.reduce((a, s) => a + (s.importedOvertimeHours || 0), 0),
    };
  }

  return { ok: false as const, error: `unknown kind ${query.kind}` };
}
