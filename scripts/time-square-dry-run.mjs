#!/usr/bin/env node
/**
 * PP-TIME-001 — Square roster reconcile + historical import dry-run.
 *
 * READ-ONLY. Never prints PINs or wages. Never invents matches.
 *
 * Usage:
 *   npx tsx scripts/time-square-dry-run.mjs
 *   PP_TIME_SQUARE_SHIFTS=/path/to/shifts.csv npx tsx scripts/time-square-dry-run.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(
  process.env.PP_TIME_SQUARE_MIGRATION ||
    "/Users/mikeai/Desktop/Party Perfect/13 - Build - Party Perfect Time/party-perfect-time-square-migration",
);

const EMPLOYEES_CSV = path.join(ROOT, "normalized/employees.csv");
const AUTH_DIR = path.join(ROOT, "raw/authenticated-2026-08-15");
const FALLBACK_SHIFTS = path.join(ROOT, "raw/square_shifts_2026-08-14_singleday_TEST.csv");

/** Preview / PP Time seed identities (roles are PP Time authority, not Square). */
const SEED_ROSTER = [
  { id: "emp-jorge", firstName: "Jorge", lastName: "Arellano", role: "EMPLOYEE" },
  { id: "emp-shelly", firstName: "Shelly", lastName: "Showroom", role: "TIME_ADMIN" },
  { id: "emp-michelle", firstName: "Michelle", lastName: "Mershon", role: "OWNER" },
  { id: "emp-mason", firstName: "Mason", lastName: "Mershon", role: "TIME_ADMIN+SECURITY" },
  { id: "emp-jacob", firstName: "Jacob", lastName: "Mershon", role: "EMPLOYEE" },
];

function normalizeName(first, last) {
  return `${String(first || "").trim().toLowerCase()} ${String(last || "").trim().toLowerCase()}`.trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(filePath) {
  if (!existsSync(filePath)) return { headers: [], rows: [], missing: true, path: filePath };
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [], missing: false, path: filePath };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
  return { headers, rows, missing: false, path: filePath };
}

function resolveShiftsPath() {
  if (process.env.PP_TIME_SQUARE_SHIFTS) return process.env.PP_TIME_SQUARE_SHIFTS;
  if (existsSync(AUTH_DIR)) {
    const files = readdirSync(AUTH_DIR)
      .filter((f) => /^shifts-export_.*\.csv$/i.test(f))
      .sort();
    // Prefer widest year ranges over single-day
    const year = files.filter((f) => /_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/.test(f) && !f.includes("08-14_2026-08-14"));
    if (year.length) return path.join(AUTH_DIR, year.sort((a, b) => b.length - a.length)[0]);
    if (files.length) return path.join(AUTH_DIR, files[files.length - 1]);
  }
  return FALLBACK_SHIFTS;
}

function parseLooseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  // Square export uses M/D/YY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return t;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function reconcileRoster(sourceRows) {
  const source = sourceRows
    .map((row) => {
      const displayed = String(row.displayed_name || row["First name"] || "").trim();
      let firstName = String(row["First name"] || row.first_name || "").trim();
      let lastName = String(row["Last name"] || row.last_name || "").trim();
      if (!firstName && displayed) {
        const parts = displayed.split(/\s+/);
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ");
      }
      return {
        firstName,
        lastName,
        key: normalizeName(firstName, lastName),
        active: String(row.active_status || row.Status || "current").toLowerCase(),
        jobTitle: String(row.job_title || row["Job title"] || ""),
        location: String(row.location || row.Location || ""),
      };
    })
    .filter((r) => r.firstName && r.lastName);

  const byKey = new Map();
  for (const row of source) {
    const list = byKey.get(row.key) || [];
    list.push(row);
    byKey.set(row.key, list);
  }

  const matched = [];
  const ambiguous = [];
  const missingInSeed = [];
  const missingInSource = [];

  for (const [key, list] of byKey) {
    if (list.length > 1) {
      ambiguous.push({ key, count: list.length, names: list.map((r) => `${r.firstName} ${r.lastName}`) });
      continue;
    }
    const row = list[0];
    const seed = SEED_ROSTER.find((s) => normalizeName(s.firstName, s.lastName) === key);
    if (seed) matched.push({ ...row, employeeId: seed.id, role: seed.role });
    else missingInSeed.push(row);
  }

  for (const seed of SEED_ROSTER) {
    const key = normalizeName(seed.firstName, seed.lastName);
    if (!byKey.has(key)) missingInSource.push(seed);
  }

  return { sourceCount: source.length, matched, ambiguous, missingInSeed, missingInSource };
}

function summarizeShifts(rows, filePath) {
  const dataRows = rows.filter((r) => {
    const first = String(r["First name"] || "").trim().toLowerCase();
    const last = String(r["Last name"] || "").trim().toLowerCase();
    if (first === "total" || first.startsWith("total")) return false;
    return true;
  });
  const named = dataRows.filter((r) => String(r["First name"] || "").trim() || String(r["Last name"] || "").trim());
  const emptyName = dataRows.length - named.length;
  const open = dataRows.filter((r) => !String(r["Clockout date"] || "").trim()).length;
  const withBreak = dataRows.filter((r) => String(r["Break start date"] || "").trim()).length;
  const overnight = dataRows.filter((r) => {
    const inDate = String(r["Clockin date"] || "").trim();
    const outDate = String(r["Clockout date"] || "").trim();
    return inDate && outDate && inDate !== outDate;
  }).length;

  let reg = 0;
  let ot = 0;
  let dt = 0;
  const dates = [];
  const sig = new Map();
  for (const r of named) {
    const f = (x) => {
      const n = Number(String(x || "").replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    reg += f(r["Regular hours"]);
    ot += f(r["Overtime hours"]);
    dt += f(r["Doubletime hours"]);
    const ci = parseLooseDate(r["Clockin date"]);
    const co = parseLooseDate(r["Clockout date"]);
    if (ci) dates.push(ci);
    if (co) dates.push(co);
    const key = [
      r["First name"],
      r["Last name"],
      r["Clockin date"],
      r["Clockin time"],
      r["Clockout date"],
      r["Clockout time"],
    ].join("|");
    sig.set(key, (sig.get(key) || 0) + 1);
  }
  dates.sort();
  const duplicateSignatures = [...sig.values()].filter((n) => n > 1).length;
  const uniqueEmployees = new Set(
    named.map((r) => normalizeName(r["First name"], r["Last name"])),
  ).size;

  return {
    sourceFile: filePath,
    shiftRows: dataRows.length,
    namedShiftRows: named.length,
    uniqueEmployeesInShifts: uniqueEmployees,
    openOrMalformed: open + emptyName,
    openMissingClockOut: open,
    emptyNameRows: emptyName,
    rowsWithBreaks: withBreak,
    overnightRows: overnight,
    regularHoursTotal: Number(reg.toFixed(2)),
    overtimeHoursTotal: Number(ot.toFixed(2)),
    doubletimeHoursTotal: Number(dt.toFixed(2)),
    duplicateShiftSignatures: duplicateSignatures,
    earliestDate: dates[0] || null,
    latestDate: dates[dates.length - 1] || null,
    wagesIgnored: true,
    completeHistory: false,
    note: "Complete history requires additional year exports (2025, 2024, …) until empty.",
  };
}

const employees = readCsv(EMPLOYEES_CSV);
const shiftsPath = resolveShiftsPath();
const shifts = readCsv(shiftsPath);
const roster = reconcileRoster(employees.rows);
const shiftSummary = shifts.missing
  ? { shiftRows: 0, completeHistory: false, sourceFile: shiftsPath }
  : summarizeShifts(shifts.rows, shiftsPath);

const safeToImport = Math.max(
  0,
  (shiftSummary.namedShiftRows || 0) - (shiftSummary.duplicateShiftSignatures || 0),
);
const needsReview =
  (shiftSummary.openOrMalformed || 0) + (shiftSummary.duplicateShiftSignatures || 0);

const report = {
  dryRun: true,
  commit: false,
  sourceRoot: ROOT,
  roster: {
    sourceEmployees: roster.sourceCount,
    matchedEmployees: roster.matched.length,
    missingEmployees: roster.missingInSeed.length,
    missingInSource: roster.missingInSource.length,
    ambiguousEmployees: roster.ambiguous.length,
    matched: roster.matched.map((r) => ({
      employeeId: r.employeeId,
      name: `${r.firstName} ${r.lastName}`,
      ppRole: r.role,
    })),
    missingInSeed: roster.missingInSeed.map((r) => `${r.firstName} ${r.lastName}`),
    missingInSource: roster.missingInSource.map(
      (r) => `${r.firstName} ${r.lastName} (${r.id}) — may be PP-only admin`,
    ),
    ambiguous: roster.ambiguous,
  },
  historicalImport: {
    ...shiftSummary,
    recordsSafeToImportEstimate: safeToImport,
    recordsRequiringHumanReview: needsReview,
    sourceMarking: "SQUARE_IMPORT / punch.source=import",
    fraudRulesOnHistorical: false,
  },
  pinConfiguration: {
    plaintextPinsInPackage: false,
    squareRevealsPasscodesByDefault: false,
    squareHasShowPasscodeControl: true,
    showPasscodeClicked: false,
    mechanism: "/time/pins secure PIN entry (hash server-side)",
  },
  identityResolution: {
    masonMershon:
      "Square shift history: MASON MERSHON (193 shifts in 2026 export). NOT on Team members list (active+deactivated). Preview lastName updated M→Mershon. PP SECURITY_ADMIN retained.",
    michelleMershon:
      "NOT in Square Team. Distinct from Michelle Saucedo (Active Sales Associate). Keep as PP OWNER only — do not merge.",
    shelly:
      "NOT in Square Team or 2026 shifts. Keep PP TIME_ADMIN placeholder lastName Showroom until Mason supplies legal last name.",
    jacobMershon: "Square Team Active Delivery Driver — added as PP EMPLOYEE.",
  },
  blockers: [
    ...(roster.ambiguous.length
      ? ["Ambiguous Square roster names must be resolved by Mason before commit."]
      : []),
    "Prior-year Square Export shifts (2025/2024/…) not yet captured — 2026 year file only so far.",
    "Mason Mershon appears in shifts but not Team roster — confirm deletion vs deactivate vs permissions.",
    "Production migration 0009 not applied; Square remains live.",
    "Late-night fee amount unresolved until Mason supplies authoritative amount.",
  ],
};

console.log(JSON.stringify(report, null, 2));
