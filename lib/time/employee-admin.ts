import { randomUUID } from "node:crypto";
import { hashTimePin, isEmployeePinShape } from "@/lib/time/pin";
import type {
  EmployeeSetupStatus,
  ShellyAssignableRole,
  TimeCapability,
  TimeEmployee,
  TrustedDevice,
} from "@/lib/time/types";

/** Ordinary employee caps — what Shelly assigns by default. */
export const ORDINARY_EMPLOYEE_CAPS: TimeCapability[] = [
  "punch",
  "self_history",
  "self_request",
];

/** Timekeeping helper (cleanup assist) — still no security/owner. */
export const TIMEKEEPING_HELPER_CAPS: TimeCapability[] = [
  ...ORDINARY_EMPLOYEE_CAPS,
  "timekeeping.review",
  "timekeeping.employees",
  "timekeeping.payroll",
];

/** Caps Shelly must never grant. */
export const FORBIDDEN_SHELLY_CAPS: ReadonlySet<TimeCapability> = new Set([
  "timekeeping.admin",
  "timekeeping.manager",
  "timekeeping.security",
  "timekeeping.owner",
]);

export function hasPinConfigured(employee: Pick<TimeEmployee, "pinHash">): boolean {
  return Boolean(employee.pinHash && employee.pinHash.startsWith("scrypt$"));
}

export function isProtectedOwnerEmployee(employee: TimeEmployee): boolean {
  if (employee.id === "emp-michelle" || employee.id === "emp-mason") return true;
  if (employee.capabilities.includes("timekeeping.security")) return true;
  if (employee.capabilities.includes("timekeeping.admin")) return true;
  if (employee.capabilities.includes("timekeeping.owner")) return true;
  return false;
}

export function capsForShellyRole(role: ShellyAssignableRole): TimeCapability[] {
  return role === "timekeeping" ? [...TIMEKEEPING_HELPER_CAPS] : [...ORDINARY_EMPLOYEE_CAPS];
}

export function parseShellyRole(v: unknown): ShellyAssignableRole {
  return v === "timekeeping" ? "timekeeping" : "employee";
}

export function shellyRoleFromCaps(caps: TimeCapability[]): ShellyAssignableRole {
  if (caps.includes("timekeeping.review") || caps.includes("timekeeping.payroll")) {
    return "timekeeping";
  }
  return "employee";
}

export function computeSetupStatus(
  employee: TimeEmployee,
  devices: TrustedDevice[],
): EmployeeSetupStatus {
  if (!employee.active) return "INACTIVE";
  if (!hasPinConfigured(employee)) return "NOT_SET_UP";
  const hasDevice = devices.some((d) => d.active && !d.revokedAt);
  if (employee.onboardingStatus === "active" && hasDevice) return "ACTIVE";
  if (hasDevice) return "DEVICE_REGISTERED";
  return "INVITED";
}

export function pinStatusLabel(employee: TimeEmployee): "configured" | "not_set" {
  return hasPinConfigured(employee) ? "configured" : "not_set";
}

export function deviceStatusLabel(
  devices: TrustedDevice[],
): "registered" | "none" | "revoked" {
  const active = devices.filter((d) => d.active && !d.revokedAt);
  if (active.length > 0) return "registered";
  if (devices.some((d) => d.revokedAt)) return "revoked";
  return "none";
}

export function timeStatusLabel(employee: TimeEmployee): "active" | "inactive" {
  return employee.active ? "active" : "inactive";
}

/** Public Time install URL for onboarding QR / copy link. */
export function timeOnboardingUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.TIME_PUBLIC_URL || env.NEXT_PUBLIC_TIME_URL || "").trim().replace(/\/$/, "");
  if (explicit) {
    return explicit.endsWith("/time") ? explicit : `${explicit}/time`;
  }
  if (env.TIME_PREVIEW === "1" || env.TIME_PREVIEW === "true") {
    return "https://time-preview.partyperfect.app/time";
  }
  return "https://partyperfect.app/time";
}

function ensureCaps(capabilities: TimeCapability[], needed: TimeCapability[]) {
  for (const cap of needed) {
    if (!capabilities.includes(cap)) capabilities.push(cap);
  }
}

export function normalizeEmployee(row: TimeEmployee): TimeEmployee {
  const capabilities = [...(row.capabilities || [])];
  // Backfill capabilities on existing preview/durable snapshots created before
  // the standalone role-aware Time app. Production roster migration assigns
  // these explicitly.
  if (row.id === "emp-shelly") {
    ensureCaps(capabilities, [
      "timekeeping.review",
      "timekeeping.employees",
      "timekeeping.payroll",
    ]);
  }
  if (row.id === "emp-michelle") {
    ensureCaps(capabilities, [
      "timekeeping.admin",
      "timekeeping.payroll",
      "timekeeping.review",
      "timekeeping.security",
      "timekeeping.owner",
    ]);
  }
  if (row.id === "emp-mason") {
    ensureCaps(capabilities, [
      "timekeeping.manager",
      "timekeeping.review",
      "timekeeping.employees",
      "timekeeping.payroll",
      "timekeeping.admin",
      "timekeeping.security",
    ]);
  }
  return {
    ...row,
    capabilities,
    startDate: row.startDate ?? null,
    notes: row.notes ?? "",
    credentialsVersion: Number.isFinite(row.credentialsVersion) ? Number(row.credentialsVersion) : 0,
  };
}

export function createEmployeeRecord(input: {
  firstName: string;
  lastName: string;
  department: string;
  title?: string;
  pin: string;
  startDate?: string | null;
  ptoEligible?: boolean;
  vacationEligible?: boolean;
  role?: ShellyAssignableRole;
  notes?: string;
  now?: string;
}): { ok: true; employee: TimeEmployee } | { ok: false; error: string } {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const department = input.department.trim();
  const pin = input.pin.trim();
  if (!firstName || !lastName) return { ok: false, error: "First and last name are required." };
  if (!department) return { ok: false, error: "Department is required." };
  if (!isEmployeePinShape(pin)) return { ok: false, error: "PIN must be exactly 4 digits." };
  const id = randomUUID();
  const now = input.now || new Date().toISOString();
  const preferredName = firstName;
  const employee: TimeEmployee = {
    id,
    employeeNumber: `E-${id.slice(0, 8).toUpperCase()}`,
    preferredName,
    firstName,
    lastName,
    phoneLast4: null,
    active: true,
    department,
    title: (input.title || "").trim(),
    pinHash: hashTimePin(pin),
    capabilities: capsForShellyRole(input.role || "employee"),
    ptoEligible: Boolean(input.ptoEligible),
    vacationEligible: Boolean(input.vacationEligible),
    onboardingStatus: "invited",
    startDate: input.startDate?.trim() || null,
    notes: (input.notes || "").trim().slice(0, 4000),
    credentialsVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { ok: true, employee };
}

export async function revokeAllTrustedDevices(
  list: TrustedDevice[],
  upsert: (row: TrustedDevice) => Promise<TrustedDevice>,
  at: string,
): Promise<number> {
  let n = 0;
  for (const d of list) {
    if (!d.active && d.revokedAt) continue;
    await upsert({
      ...d,
      active: false,
      revokedAt: d.revokedAt || at,
    });
    n += 1;
  }
  return n;
}
