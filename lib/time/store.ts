import { randomUUID } from "node:crypto";
import { hashTimePin } from "@/lib/time/pin";
import { DEFAULT_TIME_SETTINGS } from "@/lib/time/types";
import type {
  LeaveBank,
  LeaveTransaction,
  PayPeriod,
  PunchEvent,
  RequestMessage,
  SquareImportRun,
  TimeAbsence,
  TimeAudit,
  TimeCorrection,
  TimeEmployee,
  TimeNotification,
  TimeOffRequest,
  TimeSchedule,
  TimeShift,
  TimeSettings,
  TrustedDevice,
  WorkLocation,
} from "@/lib/time/types";
import { findEmployeesByName } from "@/lib/time/name-login";
import { normalizeEmployee } from "@/lib/time/employee-admin";

export function emptyShiftFields(): Pick<
  TimeShift,
  "closeKind" | "hoursAuthority" | "safetyClosedAt" | "safetyCloseRule" | "employeeCorrectionId"
> {
  return {
    closeKind: "none",
    hoursAuthority: "EMPLOYEE_CONFIRMED",
    safetyClosedAt: null,
    safetyCloseRule: null,
    employeeCorrectionId: null,
  };
}

export function normalizeShift(row: TimeShift): TimeShift {
  return {
    ...emptyShiftFields(),
    ...row,
    closeKind: row.closeKind || "none",
    hoursAuthority: row.hoursAuthority || "EMPLOYEE_CONFIRMED",
    safetyClosedAt: row.safetyClosedAt ?? null,
    safetyCloseRule: row.safetyCloseRule ?? null,
    employeeCorrectionId: row.employeeCorrectionId ?? null,
  };
}

export type TimeStore = {
  listEmployees(): Promise<TimeEmployee[]>;
  getEmployee(id: string): Promise<TimeEmployee | null>;
  findEmployeeByLogin(login: string): Promise<TimeEmployee | null>;
  findEmployeesByName(firstName: string, lastName: string): Promise<TimeEmployee[]>;
  upsertEmployee(row: TimeEmployee): Promise<TimeEmployee>;
  listLocations(): Promise<WorkLocation[]>;
  upsertLocation(row: WorkLocation): Promise<WorkLocation>;
  getSettings(): Promise<TimeSettings>;
  upsertSettings(row: Partial<TimeSettings>): Promise<TimeSettings>;
  insertPunch(row: PunchEvent): Promise<"accepted" | "duplicate">;
  updatePunch(row: PunchEvent): Promise<PunchEvent>;
  getPunchByIdempotency(key: string): Promise<PunchEvent | null>;
  getPunch(id: string): Promise<PunchEvent | null>;
  listPunches(employeeId?: string): Promise<PunchEvent[]>;
  listShifts(employeeId?: string): Promise<TimeShift[]>;
  upsertShift(row: TimeShift): Promise<TimeShift>;
  getShift(id: string): Promise<TimeShift | null>;
  listTrustedDevices(employeeId?: string): Promise<TrustedDevice[]>;
  getTrustedDevice(id: string): Promise<TrustedDevice | null>;
  upsertTrustedDevice(row: TrustedDevice): Promise<TrustedDevice>;
  listCorrections(employeeId?: string): Promise<TimeCorrection[]>;
  upsertCorrection(row: TimeCorrection): Promise<TimeCorrection>;
  getCorrection(id: string): Promise<TimeCorrection | null>;
  listAbsences(employeeId?: string): Promise<TimeAbsence[]>;
  upsertAbsence(row: TimeAbsence): Promise<TimeAbsence>;
  getAbsence(id: string): Promise<TimeAbsence | null>;
  listTimeOff(employeeId?: string): Promise<TimeOffRequest[]>;
  upsertTimeOff(row: TimeOffRequest): Promise<TimeOffRequest>;
  getTimeOff(id: string): Promise<TimeOffRequest | null>;
  listMessages(requestKind: RequestMessage["requestKind"], requestId: string): Promise<RequestMessage[]>;
  appendMessage(row: RequestMessage): Promise<RequestMessage>;
  listNotifications(employeeId: string): Promise<TimeNotification[]>;
  insertNotification(row: TimeNotification): Promise<void>;
  markNotificationRead(id: string, employeeId: string): Promise<TimeNotification | null>;
  listLeaveBanks(employeeId?: string): Promise<LeaveBank[]>;
  upsertLeaveBank(row: LeaveBank): Promise<LeaveBank>;
  listLeaveTransactions(employeeId?: string): Promise<LeaveTransaction[]>;
  insertLeaveTransaction(row: LeaveTransaction): Promise<void>;
  listSchedules(employeeId?: string): Promise<TimeSchedule[]>;
  listPayPeriods(): Promise<PayPeriod[]>;
  upsertPayPeriod(row: PayPeriod): Promise<PayPeriod>;
  listAudit(): Promise<TimeAudit[]>;
  appendAudit(row: Omit<TimeAudit, "id"> & { id?: string }): Promise<void>;
  insertImportRun(row: SquareImportRun): Promise<void>;
  listImportRuns(): Promise<SquareImportRun[]>;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function seedShowroomLocation(): WorkLocation {
  return {
    id: "loc-showroom",
    name: "PP Showroom",
    address: "8401 E 41st St, Tulsa OK 74145",
    latitude: null,
    longitude: null,
    radiusM: 150,
    active: false,
    verified: false,
    notes: "UNVERIFIED coords optional for distance signals. Punches are allowed off-site; GPS/IP/device are review evidence only.",
  };
}

export function seedDemoEmployees(now = new Date().toISOString()): TimeEmployee[] {
  const pin = hashTimePin("2468");
  return [
    {
      id: "emp-jorge",
      employeeNumber: "1001",
      preferredName: "Jorge",
      firstName: "Jorge",
      lastName: "Arellano",
      phoneLast4: "1111",
      active: true,
      department: "Delivery",
      title: "Driver",
      pinHash: pin,
      capabilities: ["punch", "self_history", "self_request"],
      ptoEligible: false,
      vacationEligible: false,
      onboardingStatus: "login_configured",
      startDate: null,
      notes: "",
      credentialsVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "emp-shelly",
      employeeNumber: "2001",
      preferredName: "Shelly",
      firstName: "Shelly",
      lastName: "Showroom",
      phoneLast4: "2222",
      active: true,
      department: "Showroom",
      title: "Day-to-day timekeeping",
      pinHash: pin,
      capabilities: [
        "punch",
        "self_history",
        "self_request",
        "timekeeping.review",
        "timekeeping.employees",
        "timekeeping.payroll",
      ],
      ptoEligible: true,
      vacationEligible: true,
      onboardingStatus: "active",
      startDate: null,
      notes:
        "Not found in Square Team (active/deactivated) or 2026 shift export. PP Time TIME_ADMIN — last name pending Mason; do not invent.",
      credentialsVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "emp-michelle",
      employeeNumber: "0001",
      preferredName: "Michelle",
      firstName: "Michelle",
      lastName: "Mershon",
      phoneLast4: "3333",
      active: true,
      department: "Owners",
      title: "Owner / domain admin",
      pinHash: pin,
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
      ptoEligible: true,
      vacationEligible: true,
      onboardingStatus: "active",
      startDate: null,
      notes:
        "Owner Michelle Mershon — NOT Michelle Saucedo (Square Sales Associate). Not on Square Team roster. PP Time OWNER.",
      credentialsVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "emp-mason",
      employeeNumber: "0002",
      preferredName: "Mason",
      firstName: "Mason",
      lastName: "Mershon",
      phoneLast4: "4444",
      active: true,
      department: "Tents",
      title: "Management / security oversight",
      pinHash: pin,
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
      ptoEligible: false,
      vacationEligible: false,
      onboardingStatus: "active",
      startDate: null,
      notes:
        "Square shift history uses MASON MERSHON; not on current Square Team roster. PP Time SECURITY_ADMIN — not granted by Square.",
      credentialsVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "emp-jacob",
      employeeNumber: "1002",
      preferredName: "Jacob",
      firstName: "Jacob",
      lastName: "Mershon",
      phoneLast4: "5555",
      active: true,
      department: "Delivery",
      title: "Delivery Driver",
      pinHash: pin,
      capabilities: ["punch", "self_history", "self_request"],
      ptoEligible: false,
      vacationEligible: false,
      onboardingStatus: "login_configured",
      startDate: null,
      notes:
        "Square Team Active Delivery Driver (PP Showroom). PP role EMPLOYEE only.",
      credentialsVersion: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createMemoryTimeStore(now = () => new Date().toISOString()): TimeStore {
  const employees = new Map(seedDemoEmployees(now()).map((e) => [e.id, e]));
  const locations = new Map([["loc-showroom", seedShowroomLocation()]]);
  const punches = new Map<string, PunchEvent>();
  const punchesByKey = new Map<string, PunchEvent>();
  const shifts = new Map<string, TimeShift>();
  const trustedDevices = new Map<string, TrustedDevice>();
  const corrections = new Map<string, TimeCorrection>();
  const absences = new Map<string, TimeAbsence>();
  const timeOff = new Map<string, TimeOffRequest>();
  const messages: RequestMessage[] = [];
  const notifications: TimeNotification[] = [];
  const banks = new Map<string, LeaveBank>();
  const leaveTx: LeaveTransaction[] = [];
  const schedules: TimeSchedule[] = [];
  const periods = new Map<string, PayPeriod>();
  const audit: TimeAudit[] = [];
  const imports: SquareImportRun[] = [];
  let settings: TimeSettings = { ...DEFAULT_TIME_SETTINGS };

  banks.set("bank-shelly-pto", {
    id: "bank-shelly-pto",
    employeeId: "emp-shelly",
    type: "pto",
    grantedHours: 40,
    usedHours: 8,
  });
  banks.set("bank-shelly-vac", {
    id: "bank-shelly-vac",
    employeeId: "emp-shelly",
    type: "vacation",
    grantedHours: 80,
    usedHours: 0,
  });
  banks.set("bank-michelle-pto", {
    id: "bank-michelle-pto",
    employeeId: "emp-michelle",
    type: "pto",
    grantedHours: 40,
    usedHours: 0,
  });

  return {
    async listEmployees() {
      return [...employees.values()].map((e) => normalizeEmployee(clone(e)));
    },
    async getEmployee(id) {
      const row = employees.get(id);
      return row ? normalizeEmployee(clone(row)) : null;
    },
    async findEmployeeByLogin(login) {
      const q = login.trim().toLowerCase();
      for (const e of employees.values()) {
        if (e.employeeNumber.toLowerCase() === q) return normalizeEmployee(clone(e));
        if (e.phoneLast4 && e.phoneLast4 === login.trim()) return normalizeEmployee(clone(e));
      }
      return null;
    },
    async findEmployeesByName(firstName, lastName) {
      return findEmployeesByName([...employees.values()], firstName, lastName).map((e) =>
        normalizeEmployee(clone(e)),
      );
    },
    async upsertEmployee(row) {
      const next = normalizeEmployee({ ...row, updatedAt: now() });
      employees.set(next.id, clone(next));
      return clone(employees.get(next.id)!);
    },
    async listLocations() {
      return [...locations.values()].map(clone);
    },
    async upsertLocation(row) {
      locations.set(row.id, clone(row));
      return clone(row);
    },
    async getSettings() {
      return clone({ ...DEFAULT_TIME_SETTINGS, ...settings });
    },
    async upsertSettings(row) {
      const current = { ...DEFAULT_TIME_SETTINGS, ...settings };
      settings = {
        maxOpenShiftHours:
          row.maxOpenShiftHours != null && Number.isFinite(row.maxOpenShiftHours)
            ? Math.max(1, Math.min(48, Number(row.maxOpenShiftHours)))
            : current.maxOpenShiftHours,
        overnightSafetyCheckHourChicago:
          row.overnightSafetyCheckHourChicago != null &&
          Number.isFinite(row.overnightSafetyCheckHourChicago)
            ? Math.max(0, Math.min(23, Math.floor(Number(row.overnightSafetyCheckHourChicago))))
            : current.overnightSafetyCheckHourChicago,
        lateNightFeeAmount:
          row.lateNightFeeAmount === null
            ? null
            : row.lateNightFeeAmount != null && Number.isFinite(row.lateNightFeeAmount)
              ? Math.max(0, Number(row.lateNightFeeAmount))
              : current.lateNightFeeAmount,
        lateNightWindowStartHourChicago:
          row.lateNightWindowStartHourChicago != null &&
          Number.isFinite(row.lateNightWindowStartHourChicago)
            ? Math.max(0, Math.min(23, Math.floor(Number(row.lateNightWindowStartHourChicago))))
            : current.lateNightWindowStartHourChicago,
        lateNightWindowEndHourChicago:
          row.lateNightWindowEndHourChicago != null &&
          Number.isFinite(row.lateNightWindowEndHourChicago)
            ? Math.max(0, Math.min(23, Math.floor(Number(row.lateNightWindowEndHourChicago))))
            : current.lateNightWindowEndHourChicago,
        shadowMode: row.shadowMode ?? current.shadowMode,
        squareSyncHealth: row.squareSyncHealth ?? current.squareSyncHealth,
        squareLastSuccessfulSyncAt:
          row.squareLastSuccessfulSyncAt !== undefined
            ? row.squareLastSuccessfulSyncAt
            : current.squareLastSuccessfulSyncAt,
        squareLastAttemptedSyncAt:
          row.squareLastAttemptedSyncAt !== undefined
            ? row.squareLastAttemptedSyncAt
            : current.squareLastAttemptedSyncAt,
        squareLastError:
          row.squareLastError !== undefined ? row.squareLastError : current.squareLastError,
        squareLastCheckpoint:
          row.squareLastCheckpoint !== undefined
            ? row.squareLastCheckpoint
            : current.squareLastCheckpoint,
        squareEmployeesSynced:
          row.squareEmployeesSynced != null && Number.isFinite(row.squareEmployeesSynced)
            ? Math.max(0, Number(row.squareEmployeesSynced))
            : current.squareEmployeesSynced,
        squareShiftsSynced:
          row.squareShiftsSynced != null && Number.isFinite(row.squareShiftsSynced)
            ? Math.max(0, Number(row.squareShiftsSynced))
            : current.squareShiftsSynced,
        squareOpenShifts:
          row.squareOpenShifts != null && Number.isFinite(row.squareOpenShifts)
            ? Math.max(0, Number(row.squareOpenShifts))
            : current.squareOpenShifts,
        squareConflicts:
          row.squareConflicts != null && Number.isFinite(row.squareConflicts)
            ? Math.max(0, Number(row.squareConflicts))
            : current.squareConflicts,
        historicalImportThrough:
          row.historicalImportThrough !== undefined
            ? row.historicalImportThrough
            : current.historicalImportThrough,
        liveSyncStartedAt:
          row.liveSyncStartedAt !== undefined
            ? row.liveSyncStartedAt
            : current.liveSyncStartedAt,
      };
      return clone(settings);
    },
    async insertPunch(row) {
      if (punchesByKey.has(row.idempotencyKey)) return "duplicate";
      punches.set(row.id, clone(row));
      punchesByKey.set(row.idempotencyKey, clone(row));
      return "accepted";
    },
    async updatePunch(row) {
      punches.set(row.id, clone(row));
      punchesByKey.set(row.idempotencyKey, clone(row));
      return clone(row);
    },
    async getPunchByIdempotency(key) {
      const row = punchesByKey.get(key);
      return row ? clone(row) : null;
    },
    async getPunch(id) {
      const row = punches.get(id);
      return row ? clone(row) : null;
    },
    async listPunches(employeeId) {
      return [...punches.values()]
        .filter((p) => !employeeId || p.employeeId === employeeId)
        .map(clone)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
    async listShifts(employeeId) {
      return [...shifts.values()]
        .filter((s) => !employeeId || s.employeeId === employeeId)
        .map((s) => clone(normalizeShift(s)))
        .sort((a, b) => b.startAt.localeCompare(a.startAt));
    },
    async upsertShift(row) {
      const next = normalizeShift(row);
      shifts.set(next.id, clone(next));
      return clone(next);
    },
    async getShift(id) {
      const row = shifts.get(id);
      return row ? clone(normalizeShift(row)) : null;
    },
    async listTrustedDevices(employeeId) {
      return [...trustedDevices.values()]
        .filter((d) => !employeeId || d.employeeId === employeeId)
        .map(clone);
    },
    async getTrustedDevice(id) {
      const row = trustedDevices.get(id);
      return row ? clone(row) : null;
    },
    async upsertTrustedDevice(row) {
      trustedDevices.set(row.id, clone(row));
      return clone(row);
    },
    async listCorrections(employeeId) {
      return [...corrections.values()]
        .filter((c) => !employeeId || c.employeeId === employeeId)
        .map(clone);
    },
    async upsertCorrection(row) {
      corrections.set(row.id, clone(row));
      return clone(row);
    },
    async getCorrection(id) {
      const row = corrections.get(id);
      return row ? clone(row) : null;
    },
    async listAbsences(employeeId) {
      return [...absences.values()]
        .filter((a) => !employeeId || a.employeeId === employeeId)
        .map(clone);
    },
    async upsertAbsence(row) {
      absences.set(row.id, clone(row));
      return clone(row);
    },
    async getAbsence(id) {
      const row = absences.get(id);
      return row ? clone(row) : null;
    },
    async listTimeOff(employeeId) {
      return [...timeOff.values()]
        .filter((t) => !employeeId || t.employeeId === employeeId)
        .map(clone);
    },
    async upsertTimeOff(row) {
      timeOff.set(row.id, clone(row));
      return clone(row);
    },
    async getTimeOff(id) {
      const row = timeOff.get(id);
      return row ? clone(row) : null;
    },
    async listMessages(requestKind, requestId) {
      return messages
        .filter((m) => m.requestKind === requestKind && m.requestId === requestId)
        .map(clone)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async appendMessage(row) {
      messages.push(clone(row));
      return clone(row);
    },
    async listNotifications(employeeId) {
      return notifications
        .filter((n) => n.employeeId === employeeId)
        .map(clone)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async insertNotification(row) {
      notifications.push(clone(row));
    },
    async markNotificationRead(id, employeeId) {
      const idx = notifications.findIndex((n) => n.id === id && n.employeeId === employeeId);
      if (idx < 0) return null;
      notifications[idx] = { ...notifications[idx], readAt: now() };
      return clone(notifications[idx]);
    },
    async listLeaveBanks(employeeId) {
      return [...banks.values()]
        .filter((b) => !employeeId || b.employeeId === employeeId)
        .map(clone);
    },
    async upsertLeaveBank(row) {
      banks.set(row.id, clone(row));
      return clone(row);
    },
    async listLeaveTransactions(employeeId) {
      return leaveTx.filter((t) => !employeeId || t.employeeId === employeeId).map(clone);
    },
    async insertLeaveTransaction(row) {
      leaveTx.push(clone(row));
    },
    async listSchedules(employeeId) {
      return schedules.filter((s) => !employeeId || s.employeeId === employeeId).map(clone);
    },
    async listPayPeriods() {
      return [...periods.values()].map(clone);
    },
    async upsertPayPeriod(row) {
      periods.set(row.id, clone(row));
      return clone(row);
    },
    async listAudit() {
      return audit.map(clone);
    },
    async appendAudit(row) {
      audit.push({ id: row.id || randomUUID(), ...row });
    },
    async insertImportRun(row) {
      imports.push(clone(row));
    },
    async listImportRuns() {
      return imports.map(clone);
    },
  };
}
