#!/usr/bin/env npx tsx
/**
 * PP-TIME-001 tests. Synthetic roster/punches only. No production credentials.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryTimeStore, seedShowroomLocation } from "../lib/time/store";
import { hashTimePin, verifyTimePin, isValidPinShape } from "../lib/time/pin";
import { verifyGeofence, haversineMeters } from "../lib/time/geofence";
import {
  decodeTimeSession,
  encodeTimeSession,
  TIME_COOKIE,
  verifyTimeMikeBearer,
  sha256Hex,
} from "../lib/time/auth";
import { recordPunch, nextAllowedPunches, clockStatusFromShift, openShiftFor } from "../lib/time/punch";
import { importSquareCsv } from "../lib/time/square-import";
import { publicEmployee } from "../lib/time/serialize";
import { TIME_COPY } from "../lib/time/strings";
import { roleHasPermission } from "../lib/api-auth-matrix.mjs";
import { isOwnerSection } from "../lib/auth";
import { canAccessSection } from "../lib/user-roles";
import { chicagoLocalToUtc } from "../lib/time/chicago";

export {};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const SHOWROOM = { latitude: 36.1047, longitude: -95.8873 };

async function readyStore() {
  const store = createMemoryTimeStore();
  const loc = seedShowroomLocation();
  await store.upsertLocation({
    ...loc,
    latitude: SHOWROOM.latitude,
    longitude: SHOWROOM.longitude,
    active: true,
    verified: true,
  });
  return store;
}

async function main() {
await check("time cookie is isolated from Command Center", () => {
  assert.equal(TIME_COOKIE, "pp_time_session");
  assert.notEqual(TIME_COOKIE, "pp_cc_session");
  const src = read("lib/time/auth.ts");
  assert.match(src, /pp_time_session/);
  assert.doesNotMatch(src, /pp_cc_session/);
  assert.doesNotMatch(read("lib/time/http.ts"), /AUTH_PASSWORD|OWNER_PIN/);
});

await check("time session HMAC does not decode as CC payload", () => {
  const token = encodeTimeSession({
    employeeId: "emp-jorge",
    capabilities: ["punch"],
    iat: Date.now(),
    exp: Date.now() + 60_000,
    cv: 0,
    v: 1,
  });
  const session = decodeTimeSession(token);
  assert.equal(session?.employeeId, "emp-jorge");
  assert.equal(decodeTimeSession("not-a-time-cookie"), null);
});

await check("PIN is hashed and verified; shape enforced", () => {
  assert.equal(isValidPinShape("2468"), true);
  assert.equal(isValidPinShape("12"), false);
  const hashed = hashTimePin("2468");
  assert.doesNotMatch(hashed, /^2468$/);
  assert.equal(verifyTimePin("2468", hashed), true);
  assert.equal(verifyTimePin("0000", hashed), false);
});

await check("inactive employees exist in seed as active-only login target", async () => {
  const store = createMemoryTimeStore();
  const jorge = await store.getEmployee("emp-jorge");
  assert.equal(jorge?.active, true);
  const inactive = await store.upsertEmployee({ ...jorge!, active: false });
  assert.equal(inactive.active, false);
});

await check("geofence classifies no verified location (signal, not auth)", () => {
  const loc = seedShowroomLocation();
  const result = verifyGeofence([loc], SHOWROOM.latitude, SHOWROOM.longitude);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_verified_location");
});

await check("geofence allow inside / deny outside", () => {
  const loc = {
    ...seedShowroomLocation(),
    latitude: SHOWROOM.latitude,
    longitude: SHOWROOM.longitude,
    active: true,
    verified: true,
    radiusM: 150,
  };
  const inside = verifyGeofence([loc], SHOWROOM.latitude, SHOWROOM.longitude);
  assert.equal(inside.ok, true);
  const outside = verifyGeofence([loc], 36.2, -95.9);
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.reason, "outside");
  assert.ok(haversineMeters(SHOWROOM.latitude, SHOWROOM.longitude, 36.2, -95.9) > 150);
});

await check("punch allowed without verified location — evidence + review signals", async () => {
  const store = createMemoryTimeStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const result = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "k1",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.punch.geofenceOk, false);
    assert.ok(result.punch.reasonCodes.includes("NO_VERIFIED_WORK_LOCATION") || result.punch.geofenceReason === "no_verified_location");
  }
});

await check("app punch requires GPS at punch moment — never invent location", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const denied = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: null,
    gpsPermission: "denied",
    idempotencyKey: "k-gps-denied",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "location_required");

  const missing = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: null,
    gpsPermission: "unavailable",
    idempotencyKey: "k-gps-missing",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "location_required");
});

await check("import punch may omit GPS — app punches cannot", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const result = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: null,
    gpsPermission: "import",
    source: "import",
    idempotencyKey: "k-gps-import",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.punch.latitude, null);
    assert.equal(result.punch.gpsPermission, "import");
  }
});

await check("off-site punch on trusted device is allowed with OUTSIDE_NORMAL_LOCATION signal", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const device = await store.upsertTrustedDevice({
    id: "dev-jorge-1",
    employeeId: employee.id,
    label: "iPhone",
    platformHint: "iOS",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    active: true,
    revokedAt: null,
  });
  const result = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: { latitude: 36.2, longitude: -95.9, accuracyM: 12 },
    gpsPermission: "granted",
    trustedDevice: device,
    deviceKnown: true,
    newDevice: false,
    clientIp: "203.0.113.10",
    networkClass: "OTHER_NETWORK",
    officeNetworkMatch: false,
    idempotencyKey: "offsite-ok",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.punch.geofenceOk, false);
    assert.ok(result.punch.reasonCodes.includes("OUTSIDE_NORMAL_LOCATION"));
    assert.equal(result.punch.trustedDevice, true);
    assert.equal(result.punch.networkClass, "OTHER_NETWORK");
    // Job-site work should not auto-block; may or may not flag for Shelly depending on score.
    assert.equal(typeof result.punch.reviewRequired, "boolean");
  }
});

await check("idempotent punch: same key is one event", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const a = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "same-key",
  });
  const b = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "same-key",
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (a.ok) assert.equal(a.duplicate, false);
  if (b.ok) assert.equal(b.duplicate, true);
  const punches = await store.listPunches(employee.id);
  assert.equal(punches.filter((p) => p.type === "clock_in").length, 1);
});

await check("lunch sequence clock_in → lunch_start → lunch_end → clock_out", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  const now = new Date("2026-08-14T15:00:00Z");
  const in1 = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "seq-in",
    now,
  });
  assert.equal(in1.ok, true);
  if (in1.ok) assert.equal(in1.status, "CLOCKED_IN");
  const badOut = await recordPunch(store, {
    employee,
    type: "clock_out",
    geo: SHOWROOM,
    idempotencyKey: "seq-out-early",
    now: new Date(now.getTime() + 1000),
  });
  assert.equal(badOut.ok, true); // clock_out is allowed while clocked in
  const store2 = await readyStore();
  const emp = (await store2.getEmployee("emp-jorge"))!;
  await recordPunch(store2, { employee: emp, type: "clock_in", geo: SHOWROOM, idempotencyKey: "l-in", now });
  const lunch = await recordPunch(store2, {
    employee: emp,
    type: "lunch_start",
    geo: SHOWROOM,
    idempotencyKey: "l-start",
    now: new Date(now.getTime() + 3600_000),
  });
  assert.equal(lunch.ok, true);
  if (lunch.ok) assert.equal(lunch.status, "ON_LUNCH");
  const deniedOut = await recordPunch(store2, {
    employee: emp,
    type: "clock_out",
    geo: SHOWROOM,
    idempotencyKey: "l-out-denied",
    now: new Date(now.getTime() + 4000_000),
  });
  assert.equal(deniedOut.ok, false);
  const lunchEnd = await recordPunch(store2, {
    employee: emp,
    type: "lunch_end",
    geo: SHOWROOM,
    idempotencyKey: "l-end",
    now: new Date(now.getTime() + 5400_000),
  });
  assert.equal(lunchEnd.ok, true);
  const out = await recordPunch(store2, {
    employee: emp,
    type: "clock_out",
    geo: SHOWROOM,
    idempotencyKey: "l-out",
    now: new Date(now.getTime() + 8 * 3600_000),
  });
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.status, "NOT_CLOCKED_IN");
});

await check("nextAllowedPunches while on lunch is lunch_end only", () => {
  assert.deepEqual(nextAllowedPunches("ON_LUNCH"), ["lunch_end"]);
  assert.deepEqual(nextAllowedPunches("NOT_CLOCKED_IN"), ["clock_in"]);
});

await check("self-only punches: Jorge never sees Shelly", async () => {
  const store = await readyStore();
  const jorge = (await store.getEmployee("emp-jorge"))!;
  const shelly = (await store.getEmployee("emp-shelly"))!;
  await recordPunch(store, { employee: jorge, type: "clock_in", geo: SHOWROOM, idempotencyKey: "j-in" });
  await recordPunch(store, { employee: shelly, type: "clock_in", geo: SHOWROOM, idempotencyKey: "s-in" });
  const jPunches = await store.listPunches(jorge.id);
  const sPunches = await store.listPunches(shelly.id);
  assert.ok(jPunches.every((p) => p.employeeId === jorge.id));
  assert.ok(sPunches.every((p) => p.employeeId === shelly.id));
  assert.equal(jPunches.length, 1);
  assert.equal(sPunches.length, 1);
  const pub = publicEmployee(jorge);
  assert.equal("pinHash" in pub, false);
});

await check("correction keeps employee text; admin remark is separate; audited; Shelly queue", async () => {
  const store = createMemoryTimeStore();
  const row = await store.upsertCorrection({
    id: "corr-1",
    employeeId: "emp-jorge",
    shiftId: null,
    punchId: null,
    affectedDate: "2026-08-12",
    issueType: "forgot_clock_out",
    requestedCorrection: "Clock out was 5:00",
    employeeExplanation: "Phone died",
    adminRemark: "",
    approvedCorrection: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    originalSnapshot: JSON.stringify({ punches: [] }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal(row.queue, "shelly");
  const decided = await store.upsertCorrection({
    ...row,
    adminRemark: "Approved after check",
    approvedCorrection: "Clock out 17:00 America/Chicago",
    state: "approved",
    decidedBy: "emp-shelly",
    decidedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal(decided.employeeExplanation, "Phone died");
  assert.equal(decided.requestedCorrection, "Clock out was 5:00");
  assert.equal(decided.adminRemark, "Approved after check");
  assert.equal(decided.approvedCorrection, "Clock out 17:00 America/Chicago");
  assert.equal(decided.originalSnapshot.includes("punches"), true);
  await store.appendAudit({
    at: new Date().toISOString(),
    actor: "emp-shelly",
    action: "correction.approved",
    target: decided.id,
    detail: decided.adminRemark,
  });
  const audit = await store.listAudit();
  assert.ok(audit.some((a) => a.action === "correction.approved"));
});

await check("absence report is simple reason; not automatic PTO; Shelly classifies", async () => {
  const store = createMemoryTimeStore();
  const { ABSENCE_REASONS } = await import("../lib/time/workflow");
  assert.deepEqual(ABSENCE_REASONS, ["Sick", "Vacation", "Personal", "Other"]);
  const row = await store.upsertAbsence({
    id: "abs-1",
    employeeId: "emp-jorge",
    startDate: "2026-08-10",
    endDate: "2026-08-10",
    reason: "Sick",
    adminClass: "unclassified",
    paid: false,
    leaveHoursApplied: null,
    employeeNote: "Stomach bug",
    managerRemark: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal(row.adminClass, "unclassified");
  assert.equal(row.paid, false);
  assert.equal(row.queue, "shelly");
  // Jorge is not PTO-eligible — classifying as pto must not invent eligibility in store alone
  const jorge = await store.getEmployee("emp-jorge");
  assert.equal(jorge?.ptoEligible, false);
});

await check("leave visibility only when eligible — never advertise benefit", async () => {
  const store = createMemoryTimeStore();
  const jorge = (await store.getEmployee("emp-jorge"))!;
  const shelly = (await store.getEmployee("emp-shelly"))!;
  assert.equal(jorge.ptoEligible, false);
  assert.equal(shelly.ptoEligible, true);
  const jBanks = await store.listLeaveBanks(jorge.id);
  const sBanks = await store.listLeaveBanks(shelly.id);
  assert.equal(jBanks.length, 0);
  assert.ok(sBanks.length > 0);
  const leaveSrc = read("app/api/time/leave/route.ts");
  assert.doesNotMatch(leaveSrc, /not eligible/i);
  assert.match(leaveSrc, /visible: false/);
  const appSrc = read("app/time/time-app.tsx");
  assert.doesNotMatch(appSrc, /not eligible/i);
  assert.match(appSrc, /Nothing to show here right now/);
});

await check("future time-off requests route to Shelly with conversation + notify foundation", async () => {
  const store = createMemoryTimeStore();
  const { notifyEmployee, postRequestMessage, buildShellyReviewQueue } = await import("../lib/time/workflow");
  const { buildMikeTimeStatus } = await import("../lib/time/mike-status");
  const off = await store.upsertTimeOff({
    id: "to-1",
    employeeId: "emp-jorge",
    startDate: "2026-09-04",
    endDate: "2026-09-07",
    reason: "vacation",
    employeeNote: "Family trip",
    managerRemark: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const queue = await buildShellyReviewQueue(store);
  assert.ok(queue.open.some((i) => i.id === off.id && i.kind === "time_off"));
  await postRequestMessage(store, {
    requestKind: "time_off",
    requestId: off.id,
    authorRole: "shelly",
    authorId: "emp-shelly",
    body: "Which days are travel days?",
  });
  await store.upsertTimeOff({ ...off, state: "needs_clarification", updatedAt: new Date().toISOString() });
  await notifyEmployee(store, {
    employeeId: "emp-jorge",
    title: "Shelly needs more information about your time-off request.",
    body: "Which days are travel days?",
    requestKind: "time_off",
    requestId: off.id,
  });
  const notes = await store.listNotifications("emp-jorge");
  assert.equal(notes.length, 1);
  const mike = await buildMikeTimeStatus(store);
  assert.equal(mike.writes, false);
  assert.equal(mike.mayApproveOrModify, false);
  assert.ok(mike.flags.futureTimeOffAwaitingAction >= 1);
  assert.ok(mike.flags.unansweredClarifications >= 1);
  assert.equal(mike.fridayCheck.remindShelly, true);
});

await check("Square dry-run overnight, Total skip, wages ignored, uncertain identity not merged", async () => {
  const store = createMemoryTimeStore();
  const csv = [
    "First Name,Last Name,Clock in date,Clock in time,Clock out date,Clock out time,Regular hours,Overtime hours,Hourly rate,Total pay,Labor cost",
    "Jorge,Arellano,2026-08-13,10:00 PM,2026-08-14,2:00 AM,4,0,$15.00,$60.00,$60.00",
    "Shelly,Showroom,2026-08-13,9:00 AM,,,,8,0,$18.00,$144.00,$144.00",
    "Mystery,Person,2026-08-13,8:00 AM,2026-08-13,4:00 PM,8,0,$20.00,$160.00,$160.00",
    "Total,,,,,,,20,0,$0,$364.00,$364.00",
  ].join("\n");
  const dry = await importSquareCsv(store, csv, { fileName: "square.csv", commit: false });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.committed, false);
  assert.equal(dry.skippedTotalRows, 1);
  assert.ok(dry.ignoredWageColumns.includes("hourly rate"));
  assert.ok(dry.ignoredWageColumns.includes("total pay"));
  assert.ok(dry.ignoredWageColumns.includes("labor cost"));
  const overnight = dry.parsed.find((p) => p.identity.toLowerCase().includes("jorge"));
  assert.equal(overnight?.overnight, true);
  const open = dry.parsed.find((p) => p.identity.toLowerCase().includes("shelly"));
  assert.equal(open?.open, true);
  assert.ok(dry.issues.some((i) => i.code === "uncertain_identity"));
  assert.equal(dry.createdShifts, 0);
  const before = (await store.listShifts()).length;
  const committed = await importSquareCsv(store, csv, { fileName: "square.csv", commit: true });
  assert.equal(committed.committed, true);
  assert.ok(committed.createdShifts >= 2);
  assert.equal((await store.listShifts()).length > before, true);
  const mystery = (await store.listEmployees()).find((e) => e.lastName === "Person");
  assert.equal(mystery, undefined);
});

await check("Square import preserves lunch start/end punches from break columns", async () => {
  const store = await readyStore();
  const csv = [
    "First name,Last name,Clockin date,Clockin time,Clockout date,Clockout time,Break start date,Break start time,Break end date,Break end time,Unpaid break,Regular hours,Overtime hours",
    "Jorge,Arellano,8/10/26,8:00:00 AM CDT,8/10/26,5:00:00 PM CDT,8/10/26,12:00:00 PM CDT,8/10/26,12:30:00 PM CDT,0.5,8.5,0",
  ].join("\n");
  const result = await importSquareCsv(store, csv, { fileName: "lunch.csv", commit: true });
  assert.equal(result.committed, true);
  const shifts = await store.listShifts("emp-jorge");
  const withLunch = shifts.find((s) => s.lunchStartAt && s.lunchEndAt);
  assert.ok(withLunch, "imported shift must carry lunchStartAt/lunchEndAt");
  const punches = await store.listPunches("emp-jorge");
  assert.ok(punches.some((p) => p.type === "lunch_start" && p.source === "import"));
  assert.ok(punches.some((p) => p.type === "lunch_end" && p.source === "import"));
});

await check("Shadow Mode defaults to ON and sync health starts NOT_CONFIGURED", async () => {
  const store = await readyStore();
  const s = await store.getSettings();
  assert.equal(s.shadowMode, true);
  assert.equal(s.squareSyncHealth, "NOT_CONFIGURED");
});

await check("trusted device cookie TTL is long-lived; session slides separately", () => {
  const auth = read("lib/time/auth.ts");
  assert.match(auth, /DEVICE_TTL_MS\s*=\s*180/);
  assert.match(auth, /SESSION_TTL_MS\s*=\s*12/);
  assert.match(read("app/api/time/me/route.ts"), /renewTrustedAuthCookies/);
  assert.match(read("app/time/time-logo-support.tsx"), /HOLD_MS\s*=\s*4000/);
  assert.match(read("app/time/time-logo-support.tsx"), /Admin \/ Support Access/);
  assert.doesNotMatch(read("app/time/time-app.tsx"), /Sign Out/);
});

await check("finalized pay period rejects punch rewrite", async () => {
  const store = await readyStore();
  const ymd = "2026-08-14";
  await store.upsertPayPeriod({
    id: "pp-1",
    startDate: "2026-08-10",
    endDate: "2026-08-16",
    status: "finalized",
    finalizedBy: "owner",
    finalizedAt: new Date().toISOString(),
  });
  const employee = (await store.getEmployee("emp-jorge"))!;
  const result = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "final-in",
    now: chicagoLocalToUtc(2026, 8, 14, 9, 0, 0),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "finalized");
  void ymd;
});

await check("Mike bearer verifies SHA-256 only; no write helpers in mike status route", () => {
  const token = "mike-time-test-token";
  const env = { TIME_MIKE_TOKEN_SHA256: sha256Hex(token) };
  assert.equal(verifyTimeMikeBearer(`Bearer ${token}`, env), true);
  assert.equal(verifyTimeMikeBearer("Bearer wrong", env), false);
  const src = read("app/api/time/mike/status/route.ts");
  assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(src, /verifyTimeMikeBearer/);
});

await check("employee lacks timekeeping CC permission; owners have it", () => {
  assert.equal(roleHasPermission("employee", "timekeeping"), false);
  assert.equal(roleHasPermission("owner", "timekeeping"), true);
  assert.equal(isOwnerSection("timekeeping"), true);
  assert.equal(canAccessSection("employee", "timekeeping"), false);
  assert.equal(canAccessSection("owner", "timekeeping"), true);
});

await check("admin vs employee API matrix in source", () => {
  const employeeRoutes = [
    "app/api/time/me/route.ts",
    "app/api/time/punch/route.ts",
    "app/api/time/history/route.ts",
    "app/api/time/corrections/route.ts",
    "app/api/time/absences/route.ts",
    "app/api/time/time-off/route.ts",
    "app/api/time/messages/route.ts",
    "app/api/time/notifications/route.ts",
    "app/api/time/leave/route.ts",
  ];
  for (const rel of employeeRoutes) {
    const src = read(rel);
    assert.match(src, /requireTimeEmployee/, rel);
    assert.doesNotMatch(src, /requireApiAuth\("timekeeping"\)/);
  }
  const adminRoutes = [
    "app/api/time/admin/overview/route.ts",
    "app/api/time/admin/employees/route.ts",
    "app/api/time/admin/locations/route.ts",
    "app/api/time/admin/timecards/route.ts",
    "app/api/time/admin/requests/route.ts",
    "app/api/time/admin/security/route.ts",
    "app/api/time/admin/payroll/route.ts",
    "app/api/time/admin/import/route.ts",
  ];
  for (const rel of adminRoutes) {
    assert.match(read(rel), /requireTime(Admin|keepingAdmin)/, rel);
  }
  assert.match(read("app/api/time/admin/requests/route.ts"), /Shelly/);
  assert.match(read("app/api/time/admin/security/route.ts"), /Mason/);
  assert.match(read("app/api/time/session/route.ts"), /export async function POST/);
});

await check("standalone Time app is role-aware and shares admin backend", () => {
  const app = read("app/time/time-app.tsx");
  const panel = read("app/time/time-admin.tsx");
  const gate = read("lib/time/http.ts");
  const caps = read("lib/time/employee-admin.ts");
  assert.match(app, /TimeAdminPanel/);
  assert.match(app, /My Time/);
  assert.match(app, /Review/);
  assert.match(app, /Employees/);
  assert.match(app, /Payroll/);
  assert.match(app, /Security/);
  assert.match(app, /My leave/);
  assert.match(app, /\/api\/time\/notifications/);
  assert.match(app, /method:\s*"PATCH"/);
  assert.match(panel, /\/api\/time\/admin\/employees/);
  assert.match(panel, /\/api\/time\/admin\/requests/);
  assert.match(panel, /\/api\/time\/admin\/payroll/);
  assert.match(panel, /\/api\/time\/admin\/security/);
  assert.match(panel, /View Timecard/);
  assert.match(panel, /Owner\/security protected/);
  assert.match(panel, /Reset PIN/);
  assert.match(panel, /Reset Device/);
  assert.match(panel, /regularHours/);
  assert.match(panel, /overtimeHours/);
  assert.match(panel, /leaveHoursApplied/);
  assert.match(panel, /action:\s*"finalize"/);
  assert.match(panel, /acknowledge:\s*true/);
  assert.match(panel, /Leave hours to apply/);
  const pinEntry = read("app/time/pins/pin-entry.tsx");
  const pinRoute = read("app/api/time/admin/pins/route.ts");
  assert.match(panel, /Secure PIN Entry/);
  assert.match(pinEntry, /Confirm and hash PINs/);
  assert.match(pinEntry, /Reconciliation/);
  assert.match(pinRoute, /hashTimePin/);
  assert.match(pinRoute, /isEmployeePinShape/);
  assert.match(pinRoute, /employee\.pin_batch_set/);
  assert.doesNotMatch(pinRoute, /detail:.*entry\.pin/);
  assert.match(gate, /pp_time_session/);
  assert.match(gate, /Command Center owner gate/);
  assert.match(gate, /timekeeping\.employees/);
  assert.match(gate, /timekeeping\.owner/);
  assert.match(caps, /emp-mason/);
  assert.match(caps, /timekeeping\.review/);
  assert.match(caps, /timekeeping\.payroll/);
  assert.match(read("app/api/time/session/route.ts"), /repeated failed PIN authentication/);
  assert.match(read("app/api/time/admin/security/route.ts"), /authenticationAlerts/);
});

await check("Time preview uses configured durable Blob when Redis is absent", async () => {
  const previous = {
    preview: process.env.TIME_PREVIEW,
    useRedis: process.env.TIME_USE_REDIS,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
  };
  try {
    process.env.TIME_PREVIEW = "1";
    delete process.env.TIME_USE_REDIS;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = "synthetic-preview-blob-token";
    const { shouldUseDurableTimeStore } = await import("../lib/time/redis-store");
    assert.equal(shouldUseDurableTimeStore(), true);
  } finally {
    for (const [key, value] of Object.entries({
      TIME_PREVIEW: previous.preview,
      TIME_USE_REDIS: previous.useRedis,
      UPSTASH_REDIS_REST_URL: previous.redisUrl,
      UPSTASH_REDIS_REST_TOKEN: previous.redisToken,
      KV_REST_API_URL: previous.kvUrl,
      KV_REST_API_TOKEN: previous.kvToken,
      BLOB_READ_WRITE_TOKEN: previous.blob,
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

await check("0009 includes time_off, messages, notifications; Shelly-first comments", () => {
  const sql = read("supabase/migrations/0009_pp_time.sql");
  assert.match(sql, /time_off_requests/);
  assert.match(sql, /request_messages/);
  assert.match(sql, /notifications/);
  assert.match(sql, /needs_clarification/);
  assert.match(sql, /queue.*shelly/i);
  assert.match(sql, /Employees never edit official punches/);
  assert.match(sql, /trusted_devices/);
  assert.match(sql, /review_required/);
  assert.match(sql, /reason_codes/);
  assert.match(sql, /PUNCH_EVIDENCE_RETENTION_DAYS|Retention: raw IP/);
});

await check("0009 is HELD; showroom seeded inactive; no Paychex send", () => {
  const sql = read("supabase/migrations/0009_pp_time.sql");
  assert.match(sql, /HELD/);
  assert.match(sql, /Do NOT apply/);
  assert.match(sql, /PP Showroom/);
  assert.match(sql, /8401 E 41st St/);
  assert.match(sql, /active\s+boolean not null default false/);
  assert.match(sql, /verified\s+boolean not null default false/);
  assert.match(read("app/api/time/admin/payroll/route.ts"), /paychexSend: false/);
});

await check("employee copy never says PWA; Time PWA scoped to /time", () => {
  const blob = JSON.stringify(TIME_COPY);
  assert.doesNotMatch(blob, /PWA/i);
  assert.doesNotMatch(read("app/time/time-app.tsx"), /PWA/);
  const manifest = read("app/time/manifest.webmanifest/route.ts");
  assert.match(manifest, /start_url: "\/time"/);
  assert.match(manifest, /scope: "\/time"/);
});

await check("iPhone first-open install walkthrough + standalone metadata", () => {
  const onboarding = read("app/time/install-onboarding.tsx");
  const layout = read("app/time/layout.tsx");
  const manifest = read("app/time/manifest.webmanifest/route.ts");
  const app = read("app/time/time-app.tsx");
  const punch = read("lib/time/punch.ts");
  assert.match(onboarding, /iphone\|ipad\|ipod/i);
  assert.match(onboarding, /display-mode: standalone/);
  assert.match(onboarding, /Tap the Share button in Safari/);
  assert.match(onboarding, /Add to Home Screen/);
  assert.match(onboarding, /Party Perfect Time will now be on your Home Screen/);
  assert.match(onboarding, /STEP 1 OF 3/);
  assert.match(onboarding, /locationPrivacy/);
  assert.match(onboarding, /locationPrivacyPrinciple/);
  assert.match(read("lib/time/strings.ts"), /uses your location only when you clock in/);
  assert.match(read("lib/time/strings.ts"), /do not track where you go throughout the day/);
  assert.match(app, /getCurrentPosition/);
  assert.match(app, /One-shot read at punch tap only/);
  assert.match(app, /maximumAge:\s*0/);
  assert.match(app, /location_required/);
  assert.match(punch, /location_required/);
  assert.doesNotMatch(app, /navigator\.geolocation\.watchPosition/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(manifest, /icon-maskable-512\.png/);
});

await check("late-night occurrence is one per overnight shift; fee stays null until configured", async () => {
  const { shiftTouchesLateNightWindow, lateNightOccurrenceForShift, lateNightFeeTotal } =
    await import("../lib/time/hours");
  const { chicagoLocalToUtc } = await import("../lib/time/chicago");
  // Tue 5:00 PM → Wed 1:00 AM Chicago — crosses midnight once.
  const start = chicagoLocalToUtc(2026, 8, 11, 17, 0, 0).toISOString();
  const end = chicagoLocalToUtc(2026, 8, 12, 1, 0, 0).toISOString();
  const shift = {
    id: "shift-ln-1",
    employeeId: "emp-jorge",
    startAt: start,
    endAt: end,
    lunchStartAt: null,
    lunchEndAt: null,
    status: "closed" as const,
  };
  assert.equal(shiftTouchesLateNightWindow(shift), true);
  const occurrence = lateNightOccurrenceForShift(shift);
  assert.ok(occurrence);
  assert.equal(occurrence?.shiftId, "shift-ln-1");
  assert.equal(lateNightFeeTotal(2, null), null);
  assert.equal(lateNightFeeTotal(2, 25), 50);
});

await check("final role matrix: Shelly ops, Mason security without finalize, Michelle owner", () => {
  const store = read("lib/time/store.ts");
  const caps = read("lib/time/employee-admin.ts");
  const payroll = read("app/api/time/admin/payroll/route.ts");
  assert.match(store, /emp-shelly[\s\S]*timekeeping\.payroll/);
  assert.doesNotMatch(store, /emp-shelly[\s\S]{0,500}timekeeping\.security/);
  assert.match(store, /emp-mason[\s\S]*timekeeping\.security/);
  assert.match(store, /emp-mason[\s\S]*timekeeping\.payroll/);
  assert.doesNotMatch(store, /emp-mason[\s\S]{0,500}timekeeping\.owner/);
  assert.match(store, /emp-michelle[\s\S]*timekeeping\.owner/);
  assert.match(caps, /emp-mason[\s\S]*timekeeping\.employees/);
  assert.match(payroll, /requireTimeAdmin\(request, "owner"\)/);
  assert.match(payroll, /lateNightFeeAmount/);
  assert.match(payroll, /fee_unresolved|Late-night fee amount unresolved/);
});

await check("capabilities are flags not hard-coded policy names", () => {
  const policy = read("lib/api-auth.ts");
  assert.doesNotMatch(policy, /Michelle|Shelly|Mason/);
  const store = read("lib/time/store.ts");
  assert.match(store, /timekeeping\.admin/);
  assert.match(store, /timekeeping\.payroll/);
  assert.match(store, /timekeeping\.review/);
  assert.match(store, /timekeeping\.security/);
  assert.doesNotMatch(store, /emp-shelly[\s\S]{0,400}timekeeping\.security/);
});

await check("Shelly ops queue excludes security; Mason/Michelle get severity alerts", async () => {
  const store = createMemoryTimeStore();
  const {
    buildShellyReviewQueue,
    buildSecurityAlertQueue,
  } = await import("../lib/time/workflow");
  const { computeSecuritySeverity, securityAlertSummary } = await import("../lib/time/verify");
  const { shellyOpsPunchView, adminPunchDetail } = await import("../lib/time/serialize");
  const { buildMikeTimeStatus } = await import("../lib/time/mike-status");
  const employee = (await store.getEmployee("emp-jorge"))!;
  const shelly = (await store.getEmployee("emp-shelly"))!;
  const mason = (await store.getEmployee("emp-mason"))!;
  const michelle = (await store.getEmployee("emp-michelle"))!;
  assert.ok(!shelly.capabilities.includes("timekeeping.security"));
  assert.ok(mason.capabilities.includes("timekeeping.security"));
  assert.ok(michelle.capabilities.includes("timekeeping.security"));

  // HIGH path with GPS required: new trusted device + off-site + new IP.
  await store.upsertLocation({
    ...seedShowroomLocation(),
    latitude: 36.1095,
    longitude: -95.8878,
    radiusM: 150,
    active: true,
    verified: true,
  });
  const device = await store.upsertTrustedDevice({
    id: "dev-sec-high",
    employeeId: employee.id,
    label: "Test phone",
    platformHint: "iOS",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    active: true,
    revokedAt: null,
  });
  const result = await recordPunch(store, {
    employee,
    type: "clock_in",
    geo: { latitude: 36.2, longitude: -95.9, accuracyM: 18 },
    gpsPermission: "granted",
    clientIp: "203.0.113.50",
    networkClass: "OTHER_NETWORK",
    officeNetworkMatch: false,
    trustedDevice: device,
    deviceKnown: false,
    newDevice: true,
    idempotencyKey: "sec-high-1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.punch.reviewRequired, true);
  assert.equal(computeSecuritySeverity(result.punch), "HIGH");
  assert.match(securityAlertSummary(result.punch, "Jorge"), /HIGH/);

  const ops = shellyOpsPunchView(result.punch);
  assert.equal("clientIp" in ops, false);
  assert.equal("riskScore" in ops, false);
  assert.equal("reasonCodes" in ops, false);
  const full = adminPunchDetail(result.punch);
  assert.ok(full.network.clientIp);
  assert.equal(full.verification.severity, "HIGH");
  assert.ok(full.gps.latitude != null);

  const shellyQ = await buildShellyReviewQueue(store);
  assert.equal(shellyQ.open.some((i) => i.id === result.punch.id), false);
  const secQ = await buildSecurityAlertQueue(store);
  assert.ok(secQ.open.some((i) => i.id === result.punch.id && i.severity === "HIGH"));
  assert.ok(secQ.high.length >= 1);

  const masonNotes = await store.listNotifications("emp-mason");
  const michelleNotes = await store.listNotifications("emp-michelle");
  const shellyNotes = await store.listNotifications("emp-shelly");
  assert.ok(masonNotes.some((n) => n.title.includes("HIGH")));
  assert.ok(michelleNotes.some((n) => n.title.includes("HIGH")));
  assert.equal(shellyNotes.some((n) => /security|HIGH|Impossible/i.test(n.title + n.body)), false);

  const mike = await buildMikeTimeStatus(store);
  assert.ok(mike.flags.securityAlertsHigh >= 1);
  assert.ok(mike.flags.securityAlertsOpen >= 1);
  assert.equal(mike.securityCheck.remindMason, true);
  assert.equal(
    mike.shellyQueue.some((i) => "severity" in i || (i as { kind: string }).kind === "security_alert"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(mike.exceptions), /203\.0\.113\.50/);
});

await check("Shelly employee admin: add, PIN reset hashed, deactivate preserves history", async () => {
  const store = createMemoryTimeStore();
  const { createEmployeeRecord, computeSetupStatus, isProtectedOwnerEmployee } = await import(
    "../lib/time/employee-admin"
  );
  const { shellyEmployeeAdminView } = await import("../lib/time/serialize");
  const { buildTimeSession, encodeTimeSession, decodeTimeSession } = await import("../lib/time/auth");
  const { verifyTimePin } = await import("../lib/time/pin");

  const created = createEmployeeRecord({
    firstName: "Gabriel",
    lastName: "Tents",
    department: "Tents",
    title: "Crew",
    pin: "1357",
    ptoEligible: false,
    vacationEligible: false,
    role: "employee",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.match(created.employee.id, /[0-9a-f-]{36}/i);
  assert.match(created.employee.employeeNumber, /^E-/);
  assert.equal(created.employee.onboardingStatus, "invited");
  assert.ok(!created.employee.capabilities.includes("timekeeping.security"));
  await store.upsertEmployee(created.employee);

  const view = shellyEmployeeAdminView(created.employee, []);
  assert.equal(view.setupStatus, "INVITED");
  assert.equal(view.pinStatus, "configured");
  assert.equal(view.deviceStatus, "none");
  assert.equal("pinHash" in view, false);
  assert.doesNotMatch(JSON.stringify(view), /1357/);

  const session = buildTimeSession(created.employee);
  assert.equal(session.cv, 0);
  const token = encodeTimeSession(session);
  assert.ok(decodeTimeSession(token));

  // Reset PIN — new hash, bump cv, revoke devices
  const { hashTimePin } = await import("../lib/time/pin");
  const afterPin: typeof created.employee = {
    ...created.employee,
    pinHash: hashTimePin("9999"),
    credentialsVersion: 1,
  };
  await store.upsertEmployee(afterPin);
  assert.equal(verifyTimePin("1357", afterPin.pinHash), false);
  assert.equal(verifyTimePin("9999", afterPin.pinHash), true);
  assert.equal(decodeTimeSession(token)?.cv, 0);
  assert.notEqual(afterPin.credentialsVersion, session.cv);

  // Deactivate preserves punches
  await recordPunch(store, {
    employee: afterPin,
    type: "clock_in",
    geo: SHOWROOM,
    idempotencyKey: "gab-in",
    trustedDevice: null,
    deviceKnown: false,
    newDevice: true,
  });
  const punchesBefore = (await store.listPunches(afterPin.id)).length;
  assert.ok(punchesBefore >= 1);
  await store.upsertEmployee({ ...afterPin, active: false, credentialsVersion: 2 });
  assert.equal((await store.listPunches(afterPin.id)).length, punchesBefore);
  assert.equal(computeSetupStatus({ ...afterPin, active: false }, []), "INACTIVE");

  const michelle = (await store.getEmployee("emp-michelle"))!;
  assert.equal(isProtectedOwnerEmployee(michelle), true);

  const empSrc = read("app/api/time/admin/employees/route.ts");
  assert.match(empSrc, /employee\.reset_pin/);
  assert.match(empSrc, /history_preserved/);
  assert.match(empSrc, /Never returns plaintext PINs|pin_set=true/);
  assert.doesNotMatch(JSON.stringify(shellyEmployeeAdminView(afterPin, [])), /9999|1357/);
});

await check("secret scan of time modules + migration", () => {
  const files = [
    "lib/time/auth.ts",
    "lib/time/store.ts",
    "lib/time/http.ts",
    "supabase/migrations/0009_pp_time.sql",
    "app/api/time/session/route.ts",
    "AI-HANDOFF/CURRENT_TASK.md",
  ];
  for (const rel of files) {
    const src = fs.existsSync(path.join(root, rel)) ? read(rel) : "";
    assert.doesNotMatch(src, /sk-[a-zA-Z0-9]{10,}/);
    assert.doesNotMatch(src, /postgres:\/\//i);
    assert.doesNotMatch(src, /Bearer [A-Za-z0-9._-]{20,}/);
  }
});

await check("openShift helper and clock status", async () => {
  const store = await readyStore();
  const employee = (await store.getEmployee("emp-jorge"))!;
  assert.equal(clockStatusFromShift(await openShiftFor(store, employee.id)), "NOT_CLOCKED_IN");
  await recordPunch(store, { employee, type: "clock_in", geo: SHOWROOM, idempotencyKey: "st-in" });
  assert.equal(clockStatusFromShift(await openShiftFor(store, employee.id)), "CLOCKED_IN");
});

await check("PIN lockout is durable, bounded, and stores no PIN", async () => {
  const {
    timePinAllowed,
    recordTimePinFailure,
    clearTimePinFailures,
    resetTimePinLimitForTests,
    TIME_PIN_MAX_FAILS,
  } = await import("../lib/time/rate-limit");
  await resetTimePinLimitForTests();
  const key = "name:lockout-test:worker";
  for (let i = 0; i < TIME_PIN_MAX_FAILS; i++) {
    assert.equal(await timePinAllowed(key), true);
    await recordTimePinFailure(key);
  }
  assert.equal(await timePinAllowed(key), false);
  const src = read("lib/time/rate-limit.ts");
  assert.match(src, /getDurableRedis|writeDurableJson/);
  assert.doesNotMatch(src, /pinHash|scrypt\$/);
  assert.match(read("app/api/time/session/route.ts"), /auth\.failed/);
  await clearTimePinFailures(key);
});

await check("Time admin area gates: Shelly no security, Mason no owner, Michelle superset", async () => {
  const { permitsTimeArea, requireTimeAdmin, isTimeAdminError } = await import("../lib/time/http");
  const { resetTimeStoreForTests, getTimeStore } = await import("../lib/time/deps");
  const { encodeTimeSession, TIME_COOKIE, buildTimeSession } = await import("../lib/time/auth");
  resetTimeStoreForTests();
  const store = await getTimeStore();
  const shelly = (await store.getEmployee("emp-shelly"))!;
  const mason = (await store.getEmployee("emp-mason"))!;
  const michelle = (await store.getEmployee("emp-michelle"))!;
  const jorge = (await store.getEmployee("emp-jorge"))!;
  assert.equal(permitsTimeArea(shelly.capabilities, "review"), true);
  assert.equal(permitsTimeArea(shelly.capabilities, "security"), false);
  assert.equal(permitsTimeArea(shelly.capabilities, "owner"), false);
  assert.equal(permitsTimeArea(mason.capabilities, "review"), true);
  assert.equal(permitsTimeArea(mason.capabilities, "security"), true);
  assert.equal(permitsTimeArea(mason.capabilities, "owner"), false);
  assert.equal(permitsTimeArea(michelle.capabilities, "owner"), true);
  assert.equal(permitsTimeArea(michelle.capabilities, "security"), true);
  assert.equal(permitsTimeArea(jorge.capabilities, "review"), false);

  const cookieFor = (emp: typeof shelly) =>
    `${TIME_COOKIE}=${encodeTimeSession(buildTimeSession(emp))}`;
  const url = "https://partyperfect.app/api/time/admin/sync";
  const httpSrc = read("lib/time/http.ts");
  assert.match(httpSrc, /timeSessionFromRequest\(request\)/);
  assert.match(httpSrc, /requireApiAuth\("timekeeping"\)/);
  const ghost = await requireTimeAdmin(
    new Request(url, {
      headers: {
        cookie: `${TIME_COOKIE}=${encodeTimeSession({
          employeeId: "emp-nobody",
          capabilities: ["timekeeping.review"],
          iat: Date.now(),
          exp: Date.now() + 60_000,
          cv: 0,
          v: 1,
        })}`,
      },
    }),
    "review",
  );
  assert.equal(isTimeAdminError(ghost), true);
  assert.equal((ghost as Response).status, 401);

  const wrong = await requireTimeAdmin(
    new Request(url, { headers: { cookie: cookieFor(jorge) } }),
    "review",
  );
  assert.equal(isTimeAdminError(wrong), true);
  assert.equal((wrong as Response).status, 403);

  const shellyOk = await requireTimeAdmin(
    new Request(url, { headers: { cookie: cookieFor(shelly) } }),
    "review",
  );
  assert.equal(isTimeAdminError(shellyOk), false);

  const shellySec = await requireTimeAdmin(
    new Request(url, { headers: { cookie: cookieFor(shelly) } }),
    "security",
  );
  assert.equal(isTimeAdminError(shellySec), true);
  assert.equal((shellySec as Response).status, 403);

  const masonSec = await requireTimeAdmin(
    new Request(url, { headers: { cookie: cookieFor(mason) } }),
    "security",
  );
  assert.equal(isTimeAdminError(masonSec), false);

  const masonOwn = await requireTimeAdmin(
    new Request("https://partyperfect.app/api/time/admin/payroll", {
      headers: { cookie: cookieFor(mason) },
    }),
    "owner",
  );
  assert.equal(isTimeAdminError(masonOwn), true);
  assert.equal((masonOwn as Response).status, 403);

  const michelleOwn = await requireTimeAdmin(
    new Request("https://partyperfect.app/api/time/admin/payroll", {
      headers: { cookie: cookieFor(michelle) },
    }),
    "owner",
  );
  assert.equal(isTimeAdminError(michelleOwn), false);
});

await check("Shadow sync: correction survives resync; Square change yields SYNC_CONFLICT", async () => {
  const { applySquareTimecards, sourceShiftId } = await import("../lib/time/shadow-sync");
  const store = createMemoryTimeStore();
  const jorge = (await store.getEmployee("emp-jorge"))!;
  const team = [{ id: "tm-jorge", given_name: "Jorge", family_name: "Arellano", status: "ACTIVE" }];
  const tc = {
    id: "tc-corr-1",
    team_member_id: "tm-jorge",
    start_at: "2026-08-17T13:00:00.000Z",
    end_at: "2026-08-17T21:00:00.000Z",
    status: "CLOSED" as const,
    updated_at: "2026-08-17T21:00:00.000Z",
    breaks: [
      { start_at: "2026-08-17T17:00:00.000Z", end_at: "2026-08-17T17:30:00.000Z" },
    ],
  };
  await applySquareTimecards(store, [tc], team, "2026-08-17T21:01:00.000Z", null);
  const shiftId = sourceShiftId(tc.id);
  const first = (await store.getShift(shiftId))!;
  assert.equal(first.endAt, tc.end_at);
  const corrId = "corr-1";
  await store.upsertCorrection({
    id: corrId,
    employeeId: jorge.id,
    shiftId,
    punchId: null,
    affectedDate: "2026-08-17",
    issueType: "wrong_time",
    requestedCorrection: "Clock out 4:00 PM",
    employeeExplanation: "Forgot phone",
    adminRemark: "",
    approvedCorrection: "",
    state: "pending",
    queue: "shelly",
    decidedBy: null,
    decidedAt: null,
    originalSnapshot: JSON.stringify({ endAt: first.endAt }),
    createdAt: "2026-08-17T21:02:00.000Z",
    updatedAt: "2026-08-17T21:02:00.000Z",
  });
  await store.upsertShift({ ...first, employeeCorrectionId: corrId, status: "pending_correction" });

  await applySquareTimecards(store, [tc], team, "2026-08-17T21:03:00.000Z", tc.updated_at);
  const afterSame = (await store.getShift(shiftId))!;
  assert.equal(afterSame.employeeCorrectionId, corrId);
  assert.equal(afterSame.endAt, tc.end_at);
  const audit1 = await store.listAudit();
  assert.equal(audit1.filter((a) => a.action === "SYNC_CONFLICT").length, 0);

  const changed = { ...tc, end_at: "2026-08-17T22:00:00.000Z", updated_at: "2026-08-17T22:00:00.000Z" };
  const second = await applySquareTimecards(store, [changed], team, "2026-08-17T22:01:00.000Z", tc.updated_at);
  assert.equal(second.skippedConflict, 1);
  const afterChange = (await store.getShift(shiftId))!;
  assert.equal(afterChange.employeeCorrectionId, corrId);
  assert.equal(afterChange.endAt, tc.end_at, "must not silently overwrite PP correction");
  const audit2 = await store.listAudit();
  assert.ok(audit2.some((a) => a.action === "SYNC_CONFLICT" && a.target === shiftId));
});

await check("Shadow sync is idempotent and keeps OPEN shifts open", async () => {
  const { applySquareTimecards, sourceShiftId } = await import("../lib/time/shadow-sync");
  const store = createMemoryTimeStore();
  const team = [{ id: "tm-jorge", given_name: "Jorge", family_name: "Arellano", status: "ACTIVE" }];
  const open = {
    id: "tc-open-1",
    team_member_id: "tm-jorge",
    start_at: "2026-08-17T13:00:00.000Z",
    end_at: null,
    status: "OPEN" as const,
    updated_at: "2026-08-17T13:00:00.000Z",
    breaks: [],
  };
  const a = await applySquareTimecards(store, [open], team, "2026-08-17T13:01:00.000Z", null);
  const b = await applySquareTimecards(store, [open], team, "2026-08-17T13:02:00.000Z", open.updated_at);
  assert.equal(a.imported, 1);
  assert.equal(b.imported, 0);
  const shift = (await store.getShift(sourceShiftId(open.id)))!;
  assert.equal(shift.status, "open");
  assert.equal(shift.endAt, null);
  const punches = (await store.listPunches()).filter((p) => p.shiftId === shift.id);
  assert.equal(punches.filter((p) => p.type === "clock_in").length, 1);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll PP-TIME-001 checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
