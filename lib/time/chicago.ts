/** America/Chicago civil-day helpers. Store UTC; display Chicago. */

export const TIME_TZ = "America/Chicago";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function chicagoYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

export function chicagoParts(d: Date): { hour: number; minute: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    hour: Number(p.hour),
    minute: Number(p.minute),
    ymd: `${p.year}-${p.month}-${p.day}`,
  };
}

function chicagoLocalStamp(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function chicagoLocalToUtc(
  y: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const desired = `${y}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  let utc = Date.parse(`${desired}Z`);
  for (let i = 0; i < 8; i++) {
    const shown = chicagoLocalStamp(new Date(utc));
    const diff = Date.parse(`${desired}Z`) - Date.parse(`${shown}Z`);
    utc += diff;
    if (diff === 0) break;
  }
  return new Date(utc);
}

export function chicagoDayBounds(d: Date): { start: Date; end: Date; ymd: string } {
  const ymd = chicagoYmd(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const start = chicagoLocalToUtc(y, m, day, 0, 0, 0);
  const next = new Date(start.getTime() + 36 * 3600 * 1000);
  const nextYmd = chicagoYmd(next);
  const [ny, nm, nd] = nextYmd.split("-").map(Number);
  const end = chicagoLocalToUtc(ny, nm, nd, 0, 0, 0);
  return { start, end, ymd };
}

/** Monday 00:00 Chicago through next Monday. */
export function chicagoWeekBounds(d: Date): { start: Date; end: Date } {
  const day = chicagoDayBounds(d);
  const [y, m, dt] = day.ymd.split("-").map(Number);
  const noon = chicagoLocalToUtc(y, m, dt, 12, 0, 0);
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_TZ,
    weekday: "short",
  }).format(noon);
  const offset = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[dow] ?? 0;
  const start = new Date(day.start.getTime() - offset * 86400000);
  const startYmd = chicagoYmd(new Date(start.getTime() + 12 * 3600 * 1000));
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const weekStart = chicagoLocalToUtc(sy, sm, sd, 0, 0, 0);
  const endProbe = new Date(weekStart.getTime() + 8 * 86400000);
  const endYmd = chicagoYmd(endProbe);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const weekEnd = chicagoLocalToUtc(ey, em, ed, 0, 0, 0);
  return { start: weekStart, end: weekEnd };
}

export function inRange(iso: string, start: Date, end: Date): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

export function formatChicagoTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
