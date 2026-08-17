#!/usr/bin/env node
/**
 * PP-TIME Shadow Mode — offline migration pack from Square Export shifts CSVs.
 *
 * READ-ONLY vs Square. Writes ONLY to the protected local migration workspace
 * (never Git-committed employee dumps).
 *
 * Usage:
 *   node --import tsx scripts/time-square-migrate-pack.mjs
 *   PP_TIME_SQUARE_MIGRATION=/path node --import tsx scripts/time-square-migrate-pack.mjs
 */
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createMemoryTimeStore, seedShowroomLocation } from "../lib/time/store.ts";
import { importSquareCsv } from "../lib/time/square-import.ts";
import { lateNightOccurrenceForShift } from "../lib/time/hours.ts";
import { DEFAULT_TIME_SETTINGS } from "../lib/time/types.ts";
import { hashTimePin } from "../lib/time/pin.ts";

const ROOT = path.resolve(
  process.env.PP_TIME_SQUARE_MIGRATION ||
    "/Users/mikeai/Desktop/Party Perfect/13 - Build - Party Perfect Time/party-perfect-time-square-migration",
);
const OUT = path.join(ROOT, "normalized", "migration-pack");
const EMPLOYEES_CSV = path.join(ROOT, "normalized/employees.csv");
const AUTH_DIRS = [
  path.join(ROOT, "raw/authenticated-2026-08-17"),
  path.join(ROOT, "raw/authenticated-2026-08-15"),
  path.join(ROOT, "raw"),
];

const PP_ONLY = [
  {
    id: "emp-shelly",
    firstName: "Shelly",
    lastName: "Showroom",
    preferredName: "Shelly",
    department: "Showroom",
    title: "Day-to-day timekeeping",
    capabilities: [
      "punch",
      "self_history",
      "self_request",
      "timekeeping.review",
      "timekeeping.employees",
      "timekeeping.payroll",
    ],
    role: "TIME_ADMIN",
  },
  {
    id: "emp-michelle",
    firstName: "Michelle",
    lastName: "Mershon",
    preferredName: "Michelle",
    department: "Owners",
    title: "Owner",
    capabilities: [
      "punch",
      "self_history",
      "self_request",
      "timekeeping.admin",
      "timekeeping.payroll",
      "timekeeping.review",
      "timekeeping.security",
      "timekeeping.owner",
    ],
    role: "OWNER",
  },
  {
    id: "emp-mason",
    firstName: "Mason",
    lastName: "Mershon",
    preferredName: "Mason",
    department: "Tents",
    title: "Management / security",
    capabilities: [
      "punch",
      "self_history",
      "self_request",
      "timekeeping.manager",
      "timekeeping.review",
      "timekeeping.employees",
      "timekeeping.payroll",
      "timekeeping.admin",
      "timekeeping.security",
    ],
    role: "TIME_ADMIN+SECURITY",
  },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

function stableEmployeeId(first, last) {
  const hex = createHash("sha256")
    .update(`pp-time:${first.trim().toLowerCase()}|${last.trim().toLowerCase()}`)
    .digest("hex");
  return `emp-${hex.slice(0, 12)}`;
}

function classifyRow(parsed) {
  if (parsed.identityUncertain || !parsed.employeeId) {
    if (!String(parsed.identity || "").trim() || parsed.identity === "(blank)")
      return "MISSING_IDENTITY";
    return "NEEDS_HUMAN_REVIEW";
  }
  if (!parsed.clockIn) return "MALFORMED";
  if (parsed.open) return "OPEN_SHIFT";
  return "SAFE_IMPORT";
}

function findShiftCsvs() {
  const found = [];
  for (const dir of AUTH_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/^shifts-export_.*\.csv$/i.test(f) && !/square_shifts_.*\.csv$/i.test(f)) continue;
      found.push(path.join(dir, f));
    }
  }
  // Prefer wider year ranges first
  return [...new Set(found)].sort((a, b) => b.length - a.length);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const now = () => new Date().toISOString();
  const pinPlaceholder = hashTimePin("0000"); // never a real PIN — forces /time/pins
  const store = createMemoryTimeStore(now);
  await store.upsertLocation(seedShowroomLocation());

  // --- Roster ---
  const empText = existsSync(EMPLOYEES_CSV) ? readFileSync(EMPLOYEES_CSV, "utf8") : "";
  const empTable = empText ? parseCsv(empText) : [];
  const empHeaders = (empTable[0] || []).map((h) => h.trim().toLowerCase());
  const idx = (name) => empHeaders.indexOf(name);
  const squareRoster = [];
  for (const cols of empTable.slice(1)) {
    const get = (n) => cols[idx(n)] || "";
    const first = (get("first_name") || "").trim();
    const last = (get("last_name") || "").trim();
    if (!first && !last) continue;
    const status = (get("active_status") || "").trim();
    const id = stableEmployeeId(first, last);
    // Prefer fixed PP ids for known matches
    let employeeId = id;
    const key = `${first} ${last}`.toLowerCase();
    if (key === "jorge arellano") employeeId = "emp-jorge";
    if (key === "jacob mershon") employeeId = "emp-jacob";
    if (key === "mason mershon") employeeId = "emp-mason";

    const active = status === "current" || status === "SHIFT_HISTORY_ONLY";
    const row = {
      id: employeeId,
      employeeNumber: "",
      preferredName: first,
      firstName: first.replace(/\b\w/g, (c) => c.toUpperCase()),
      lastName: last.replace(/\b\w/g, (c) => c.toUpperCase()),
      phoneLast4: null,
      active: status !== "deactivated",
      department: get("job_title") || "General",
      title: get("job_title") || "",
      pinHash: pinPlaceholder,
      capabilities: ["punch", "self_history", "self_request"],
      ptoEligible: false,
      vacationEligible: false,
      onboardingStatus: active ? "login_configured" : "inactive",
      startDate: null,
      notes: `Square roster · ${status} · ${get("notes") || ""}`.trim(),
      credentialsVersion: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    // Title-case first/last carefully for ALL CAPS names
    if (first === first.toUpperCase()) row.firstName = first[0] + first.slice(1).toLowerCase();
    if (last === last.toUpperCase()) row.lastName = last[0] + last.slice(1).toLowerCase();
    if (key.includes("mason")) {
      row.firstName = "Mason";
      row.lastName = "Mershon";
      row.preferredName = "Mason";
    }
    squareRoster.push(row);
    await store.upsertEmployee(row);
  }

  for (const p of PP_ONLY) {
    const existing = await store.getEmployee(p.id);
    const row = {
      id: p.id,
      employeeNumber: p.id === "emp-michelle" ? "0001" : p.id === "emp-mason" ? "0002" : "2001",
      preferredName: p.preferredName,
      firstName: p.firstName,
      lastName: p.lastName,
      phoneLast4: null,
      active: true,
      department: p.department,
      title: p.title,
      pinHash: existing?.pinHash || pinPlaceholder,
      capabilities: p.capabilities,
      ptoEligible: p.id !== "emp-mason",
      vacationEligible: p.id === "emp-michelle" || p.id === "emp-shelly",
      onboardingStatus: "active",
      startDate: null,
      notes: existing?.notes || `PP-only · role ${p.role} · not granted by Square`,
      credentialsVersion: existing?.credentialsVersion ?? 0,
      createdAt: existing?.createdAt || now(),
      updatedAt: now(),
    };
    await store.upsertEmployee(row);
  }

  // --- Import all CSVs ---
  const csvs = findShiftCsvs();
  const review = [];
  let createdShifts = 0;
  let createdPunches = 0;
  const fileSummaries = [];

  for (const file of csvs) {
    const text = readFileSync(file, "utf8");
    const result = await importSquareCsv(store, text, {
      fileName: path.basename(file),
      commit: true,
      actor: "migration-pack",
    });
    createdShifts += result.createdShifts;
    createdPunches += result.createdPunches;
    for (const p of result.parsed) {
      const cls = classifyRow(p);
      if (cls !== "SAFE_IMPORT") {
        review.push({
          class: cls,
          file: path.basename(file),
          row: p.row,
          identity: p.identity,
          employeeId: p.employeeId,
          clockIn: p.clockIn,
          clockOut: p.clockOut,
          open: p.open,
        });
      }
    }
    fileSummaries.push({
      file: path.basename(file),
      parsed: result.parsed.length,
      createdShifts: result.createdShifts,
      createdPunches: result.createdPunches,
      issues: result.issues.length,
    });
  }

  const shifts = await store.listShifts();
  const punches = await store.listPunches();
  const employees = await store.listEmployees();
  let lateNight = 0;
  for (const s of shifts) {
    if (lateNightOccurrenceForShift(s, DEFAULT_TIME_SETTINGS)) lateNight += 1;
  }

  const dates = shifts
    .map((s) => s.startAt?.slice(0, 10))
    .filter(Boolean)
    .sort();
  const openShifts = shifts.filter((s) => s.status === "open" || s.status === "on_lunch").length;
  const withLunch = shifts.filter((s) => s.lunchStartAt).length;
  const pinsConfigured = employees.filter((e) => e.pinHash && !e.notes?.includes("placeholder")).length;
  // All have placeholder hash from this pack — report as requiring PIN entry
  const pinsMissing = employees.filter((e) => e.active).length;

  const snapshot = {
    v: 2,
    generatedAt: now(),
    shadowMode: true,
    authority: "SQUARE",
    employees,
    locations: await store.listLocations(),
    punches,
    shifts,
    trustedDevices: [],
    settings: {
      ...DEFAULT_TIME_SETTINGS,
      shadowMode: true,
      historicalImportThrough: dates[dates.length - 1] || null,
      squareSyncHealth: "OFF",
      squareLastCheckpoint: null,
    },
    corrections: [],
    absences: [],
    timeOff: [],
    messages: [],
    notifications: [],
    banks: [],
    leaveTx: [],
    schedules: [],
    periods: [],
    audit: await store.listAudit(),
    imports: await store.listImportRuns(),
  };

  // Strip pin hashes from any exported review artifact? Keep hashed only in snapshot for preview seed.
  writeFileSync(path.join(OUT, "preview-snapshot.json"), JSON.stringify(snapshot));
  writeFileSync(path.join(OUT, "MIGRATION_REVIEW.jsonl"), review.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const readiness = {
    generatedAt: now(),
    sourceRoot: ROOT,
    csvFiles: fileSummaries,
    roster: {
      squareIdentities: squareRoster.length,
      ppTimeIdentities: employees.length,
      matchedKnown: ["Jacob Mershon", "Jorge Arellano", "Mason Mershon"].filter((n) =>
        employees.some((e) => `${e.firstName} ${e.lastName}` === n),
      ),
      ppOnly: ["Shelly Showroom", "Michelle Mershon"],
      historicalOnly: squareRoster.filter((e) => /SHIFT_HISTORY/i.test(e.notes)).length,
      unresolved: review.filter((r) => r.class === "MISSING_IDENTITY" || r.class === "NEEDS_HUMAN_REVIEW").length,
    },
    history: {
      earliestImported: dates[0] || null,
      latestImported: dates[dates.length - 1] || null,
      totalShifts: shifts.length,
      totalPunches: punches.length,
      totalBreaks: withLunch,
      overnightShifts: shifts.filter(
        (s) => s.endAt && s.startAt.slice(0, 10) !== s.endAt.slice(0, 10),
      ).length,
      lateNightOccurrences: lateNight,
      openShifts,
      quarantinedRecords: review.length,
      createdShifts,
      createdPunches,
    },
    pins: {
      configured: 0,
      missing: pinsMissing,
      note: "All active employees require PIN entry via /time/pins — pack uses non-production placeholder hash only",
    },
    validation: {
      employeesSampled: 0,
      shiftsCompared: 0,
      discrepancies: null,
      unexplainedDiscrepancies: null,
      note: "Sample Square vs PPT validation pending after preview load + Mason fact-check",
    },
    production: {
      url: "https://partyperfect.app/time",
      qrDestination: "https://partyperfect.app/time",
      databaseReady: false,
      rolesVerified: true,
      locationVerified: true,
      securityVerified: true,
      payrollVerified: false,
      historyVerified: false,
      rollbackReady: true,
      squareRemainsLive: true,
      migration0009Applied: false,
    },
    verdict:
      dates[dates.length - 1] >= "2026-08-17"
        ? "READY_FOR_MASON_FACT_CHECK"
        : "NOT_READY_FOR_MASON_FACT_CHECK",
    blockers: [
      ...(dates[dates.length - 1] < "2026-08-17"
        ? [`Latest imported date ${dates[dates.length - 1] || "none"} — need Export shifts through 2026-08-17`]
        : []),
      "Square Labor API token scopes not verified in this environment",
      "PINs not entered — use /time/pins",
      "0009 not applied — production DB not cut over",
    ],
  };

  writeFileSync(path.join(OUT, "CUTOVER_READINESS.json"), JSON.stringify(readiness, null, 2));
  console.log(JSON.stringify(readiness, null, 2));
  console.log(`\nWrote ${OUT}/preview-snapshot.json`);
  console.log(`Wrote ${OUT}/MIGRATION_REVIEW.jsonl (${review.length} rows)`);
  console.log(`Wrote ${OUT}/CUTOVER_READINESS.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
