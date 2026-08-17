import { createHash, randomUUID } from "node:crypto";
import type { TimeStore } from "@/lib/time/store";
import type { PunchEvent, SquareImportRun, TimeEmployee, TimeShift } from "@/lib/time/types";
import { blankPunchEvidence } from "@/lib/time/types";
import { emptyShiftFields } from "@/lib/time/store";
import { chicagoLocalToUtc } from "@/lib/time/chicago";
import { lunchSeconds, paidSecondsForShift } from "@/lib/time/hours";

const WAGE_HEADERS = new Set([
  "hourly rate",
  "hourlyrate",
  "rate",
  "pay rate",
  "total pay",
  "totalpay",
  "labor cost",
  "laborcost",
  "wage",
  "wages",
  "cash tips",
  "credit tips",
  "tips",
  "declared tips",
]);

export type SquareImportRowIssue = {
  row: number;
  code: string;
  message: string;
};

export type SquareImportParsedShift = {
  row: number;
  employeeId: string | null;
  identity: string;
  identityUncertain: boolean;
  clockIn: string | null;
  clockOut: string | null;
  overnight: boolean;
  open: boolean;
  missingBreak: boolean;
  regularHours: number | null;
  overtimeHours: number | null;
  doubletimeHours: number | null;
};

export type SquareImportResult = {
  fileHash: string;
  fileName: string;
  dryRun: boolean;
  committed: boolean;
  skippedTotalRows: number;
  ignoredWageColumns: string[];
  parsed: SquareImportParsedShift[];
  issues: SquareImportRowIssue[];
  createdShifts: number;
  createdPunches: number;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function pick(map: Record<string, string>, names: string[]): string {
  for (const n of names) {
    if (map[n]?.trim()) return map[n].trim();
  }
  return "";
}

function parseHours(v: string): number | null {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSquareStamp(dateStr: string, timeStr: string): string | null {
  const d = dateStr.trim();
  const t = timeStr.trim();
  if (!d) return null;
  const datePart = d.includes("T") ? d.slice(0, 10) : d.replace(/\//g, "-");
  let y: number;
  let m: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  const mdY = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(datePart);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    day = Number(iso[3]);
  } else if (mdY) {
    m = Number(mdY[1]);
    day = Number(mdY[2]);
    y = Number(mdY[3]);
    if (y < 100) y += 2000;
  } else {
    const parsed = Date.parse(d);
    if (!Number.isFinite(parsed)) return null;
    const dt = new Date(parsed);
    return dt.toISOString();
  }
  let hour = 0;
  let minute = 0;
  let second = 0;
  const timeSrc = t || (d.includes("T") ? d.split("T")[1] || "" : "");
  if (timeSrc) {
    const ampm = /am|pm/i.test(timeSrc);
    const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeSrc);
    if (tm) {
      hour = Number(tm[1]);
      minute = Number(tm[2]);
      second = Number(tm[3] || 0);
      if (ampm) {
        const isPm = /pm/i.test(timeSrc);
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;
      }
    }
  }
  return chicagoLocalToUtc(y, m, day, hour, minute, second).toISOString();
}

function matchEmployee(employees: TimeEmployee[], row: Record<string, string>): {
  employee: TimeEmployee | null;
  identity: string;
  uncertain: boolean;
} {
  const number = pick(row, ["employee number", "employee id", "staff id", "id"]);
  const first = pick(row, ["first name", "firstname"]);
  const last = pick(row, ["last name", "lastname"]);
  const full = pick(row, ["employee", "name", "employee name"]) || `${first} ${last}`.trim();
  const identity = number || full || "(blank)";

  if (number) {
    const hits = employees.filter((e) => e.employeeNumber.toLowerCase() === number.toLowerCase());
    if (hits.length === 1) return { employee: hits[0], identity, uncertain: false };
    return { employee: null, identity, uncertain: true };
  }
  const byName = employees.filter((e) => {
    const pref = e.preferredName.toLowerCase();
    const fl = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
    const q = full.toLowerCase();
    const firstQ = first.toLowerCase();
    const lastQ = last.toLowerCase();
    if (q && (fl === q || pref === q)) return true;
    if (firstQ && lastQ) {
      return (
        e.firstName.toLowerCase() === firstQ && e.lastName.toLowerCase() === lastQ
      );
    }
    return false;
  });
  if (byName.length === 1) return { employee: byName[0], identity, uncertain: false };
  return { employee: null, identity, uncertain: true };
}

function isTotalRow(map: Record<string, string>, values: string[]): boolean {
  const blob = `${Object.values(map).join(" ")} ${values.join(" ")}`.toLowerCase();
  return /\btotals?\b/.test(blob) && !map["clock in date"] && !map["clock in"];
}

export async function importSquareCsv(
  store: TimeStore,
  csvText: string,
  opts: { fileName?: string; commit?: boolean; actor?: string } = {},
): Promise<SquareImportResult> {
  const fileName = opts.fileName || "square.csv";
  const dryRun = !opts.commit;
  const fileHash = createHash("sha256").update(csvText, "utf8").digest("hex");
  const table = parseCsv(csvText);
  const issues: SquareImportRowIssue[] = [];
  const parsed: SquareImportParsedShift[] = [];
  const employees = await store.listEmployees();
  if (table.length === 0) {
    const empty: SquareImportResult = {
      fileHash,
      fileName,
      dryRun,
      committed: false,
      skippedTotalRows: 0,
      ignoredWageColumns: [],
      parsed,
      issues: [{ row: 0, code: "empty", message: "CSV had no rows" }],
      createdShifts: 0,
      createdPunches: 0,
    };
    await persistRun(store, empty);
    return empty;
  }

  const headers = table[0].map(normHeader);
  const ignoredWageColumns = headers.filter((h) => WAGE_HEADERS.has(h));
  let skippedTotalRows = 0;
  let createdShifts = 0;
  let createdPunches = 0;

  for (let i = 1; i < table.length; i++) {
    const values = table[i];
    const map: Record<string, string> = {};
    headers.forEach((h, idx) => {
      map[h] = values[idx] || "";
    });
    if (isTotalRow(map, values) || values[0]?.trim().toLowerCase() === "total") {
      skippedTotalRows += 1;
      continue;
    }

    const matched = matchEmployee(employees, map);
    const inDate = pick(map, ["clock in date", "in date", "start date", "clockin date"]);
    const inTime = pick(map, ["clock in time", "in time", "start time", "clockin time"]);
    const outDate = pick(map, ["clock out date", "out date", "end date", "clockout date"]);
    const outTime = pick(map, ["clock out time", "out time", "end time", "clockout time"]);
    const breakInDate = pick(map, ["break start date", "lunch start date"]);
    const breakInTime = pick(map, ["break start time", "lunch start time"]);
    const breakOutDate = pick(map, ["break end date", "lunch end date"]);
    const breakOutTime = pick(map, ["break end time", "lunch end time"]);
    const combinedIn = pick(map, ["clock in", "clockin", "start"]);
    const combinedOut = pick(map, ["clock out", "clockout", "end"]);
    const clockIn = combinedIn
      ? parseSquareStamp(combinedIn, "")
      : parseSquareStamp(inDate, inTime);
    const clockOut = combinedOut
      ? parseSquareStamp(combinedOut, "")
      : parseSquareStamp(outDate, outTime);
    const lunchStartAt = parseSquareStamp(breakInDate, breakInTime);
    const lunchEndAt = parseSquareStamp(breakOutDate, breakOutTime);
    const open = Boolean(clockIn && !clockOut);
    const unpaid = pick(map, ["unpaid breaks", "unpaid break", "break"]);
    const durationH = clockIn && clockOut ? (Date.parse(clockOut) - Date.parse(clockIn)) / 3600000 : 0;
    const missingBreak = durationH >= 6 && !unpaid && !lunchStartAt;

    if (matched.uncertain) {
      issues.push({
        row: i + 1,
        code: "uncertain_identity",
        message: `Did not merge row for ${matched.identity}`,
      });
    }
    if (!clockIn) {
      issues.push({ row: i + 1, code: "missing_clock_in", message: "No clock-in timestamp" });
    }

    parsed.push({
      row: i + 1,
      employeeId: matched.uncertain ? null : matched.employee?.id ?? null,
      identity: matched.identity,
      identityUncertain: matched.uncertain,
      clockIn,
      clockOut,
      overnight: Boolean(
        clockIn &&
          clockOut &&
          chicagoDayRolled(clockIn, clockOut),
      ),
      open,
      missingBreak,
      regularHours: parseHours(pick(map, ["regular hours", "reg hours", "regular"])),
      overtimeHours: parseHours(pick(map, ["overtime hours", "ot hours", "overtime"])),
      doubletimeHours: parseHours(pick(map, ["doubletime hours", "double time hours", "doubletime"])),
    });

    if (dryRun || matched.uncertain || !matched.employee || !clockIn) continue;

    const shiftId = randomUUID();
    const shift: TimeShift = {
      id: shiftId,
      employeeId: matched.employee.id,
      startAt: clockIn,
      endAt: clockOut,
      lunchStartAt,
      lunchEndAt,
      status: clockOut ? "closed" : lunchStartAt && !lunchEndAt ? "on_lunch" : "open",
      paidSeconds: clockOut
        ? paidSecondsForShift({
            startAt: clockIn,
            endAt: clockOut,
            lunchStartAt,
            lunchEndAt,
          })
        : null,
      lunchSeconds: lunchSeconds({ lunchStartAt, lunchEndAt }),
      source: "import",
      payPeriodId: null,
      importedRegularHours: parseHours(pick(map, ["regular hours", "reg hours", "regular"])),
      importedOvertimeHours: parseHours(pick(map, ["overtime hours", "ot hours", "overtime"])),
      importedDoubletimeHours: parseHours(pick(map, ["doubletime hours", "double time hours", "doubletime"])),
      ...emptyShiftFields(),
      closeKind: clockOut ? "employee" : "none",
      hoursAuthority: clockOut ? "EMPLOYEE_CONFIRMED" : "EMPLOYEE_CONFIRMED",
    };
    await store.upsertShift(shift);
    createdShifts += 1;
    const punches: PunchEvent[] = [
      blankPunchEvidence({
        id: randomUUID(),
        employeeId: matched.employee.id,
        type: "clock_in",
        occurredAt: clockIn,
        ingestedAt: new Date().toISOString(),
        geofenceOk: false,
        geofenceReason: "import",
        gpsPermission: "import",
        source: "import",
        idempotencyKey: `square:${fileHash}:${i}:in`,
        shiftId,
        deviceHint: "square-csv",
      }),
    ];
    if (lunchStartAt) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "lunch_start",
          occurredAt: lunchStartAt,
          idempotencyKey: `square:${fileHash}:${i}:lunch_start`,
        }),
      );
    }
    if (lunchEndAt) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "lunch_end",
          occurredAt: lunchEndAt,
          idempotencyKey: `square:${fileHash}:${i}:lunch_end`,
        }),
      );
    }
    if (clockOut) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "clock_out",
          occurredAt: clockOut,
          idempotencyKey: `square:${fileHash}:${i}:out`,
        }),
      );
    }
    for (const p of punches) {
      const r = await store.insertPunch(p);
      if (r === "accepted") createdPunches += 1;
    }
  }

  const result: SquareImportResult = {
    fileHash,
    fileName,
    dryRun,
    committed: Boolean(opts.commit),
    skippedTotalRows,
    ignoredWageColumns,
    parsed,
    issues,
    createdShifts: dryRun ? 0 : createdShifts,
    createdPunches: dryRun ? 0 : createdPunches,
  };
  await persistRun(store, result);
  if (opts.actor) {
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: opts.actor,
      action: opts.commit ? "square.import.commit" : "square.import.dry_run",
      target: fileHash,
      detail: fileName,
    });
  }
  return result;
}

function chicagoDayRolled(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  const fa = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });
  return fa.format(da) !== fa.format(db);
}

async function persistRun(store: TimeStore, result: SquareImportResult) {
  const row: SquareImportRun = {
    id: randomUUID(),
    fileHash: result.fileHash,
    fileName: result.fileName,
    dryRun: result.dryRun,
    committed: result.committed,
    createdAt: new Date().toISOString(),
    resultJson: JSON.stringify({
      skippedTotalRows: result.skippedTotalRows,
      ignoredWageColumns: result.ignoredWageColumns,
      issues: result.issues,
      parsedCount: result.parsed.length,
      createdShifts: result.createdShifts,
      createdPunches: result.createdPunches,
    }),
  };
  await store.insertImportRun(row);
}
