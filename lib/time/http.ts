import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthError, privateJson, requireApiAuth } from "@/lib/api-auth";
import {
  buildTimeSession,
  isTimeAuthError,
  requireTimeSession,
  timeSessionFromRequest,
  timePrivateJson,
  trustedDeviceTokenFromRequest,
  verifyTimeMikeBearer,
  type TimeSession,
  type TrustedDeviceToken,
} from "@/lib/time/auth";
import { resolveTrustedDevice } from "@/lib/time/device";
import { getTimeStore } from "@/lib/time/deps";
import { isValidPinShape, verifyTimePin } from "@/lib/time/pin";
import { clockStatusFromShift, hoursSummary, openShiftFor } from "@/lib/time/punch";
import { runOpenShiftSafetySweep } from "@/lib/time/safety-close";
import { employeeMePayload, publicEmployee } from "@/lib/time/serialize";
import type { TimeCapability, TimeEmployee } from "@/lib/time/types";

export async function loadTimeEmployee(employeeId: string): Promise<TimeEmployee | null> {
  return (await getTimeStore()).getEmployee(employeeId);
}

/**
 * Slide session + trusted-device cookies on activity.
 * Device identity stays first-party (not IP). Revocation still clears both.
 */
export async function renewTrustedAuthCookies(
  request: Request,
  employee: TimeEmployee,
): Promise<{ session: TimeSession; device: TrustedDeviceToken | null }> {
  const session = buildTimeSession(employee);
  const existing = trustedDeviceTokenFromRequest(request);
  if (!existing || existing.employeeId !== employee.id) {
    return { session, device: null };
  }
  const store = await getTimeStore();
  const deviceRes = await resolveTrustedDevice(store, {
    employeeId: employee.id,
    existingToken: existing,
    userAgent: request.headers.get("user-agent"),
  });
  return { session, device: deviceRes.token };
}

export async function requireTimeEmployee(request: Request) {
  const session = await requireTimeSession(request);
  if (isTimeAuthError(session)) return session;
  const employee = await loadTimeEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return timePrivateJson(
      { error: "Unauthorized" },
      { status: 401, clear: true, clearDevice: true },
    );
  }
  const sessionCv = session.cv ?? 0;
  const empCv = employee.credentialsVersion ?? 0;
  if (sessionCv !== empCv) {
    return timePrivateJson(
      { error: "Session expired. Sign in again." },
      { status: 401, clear: true, clearDevice: true },
    );
  }
  return employee;
}

export function isTimeEmployeeError(v: TimeEmployee | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export async function mePayloadFor(employee: TimeEmployee) {
  const store = await getTimeStore();
  await runOpenShiftSafetySweep(store);
  const shift = await openShiftFor(store, employee.id);
  const hours = await hoursSummary(store, employee.id);
  const punches = await store.listPunches(employee.id);
  const corrections = await store.listCorrections(employee.id);
  const absences = await store.listAbsences(employee.id);
  const timeOff = await store.listTimeOff(employee.id);
  const leaveBanks = await store.listLeaveBanks(employee.id);
  const notifications = await store.listNotifications(employee.id);
  const shifts = await store.listShifts(employee.id);
  const forgotten = shifts.find(
    (s) =>
      s.status === "pending_correction" &&
      s.closeKind === "system_pending_correction" &&
      !s.employeeCorrectionId,
  );
  return employeeMePayload({
    employee,
    status: clockStatusFromShift(shift),
    todaySeconds: hours.todaySeconds,
    weekSeconds: hours.weekSeconds,
    shift,
    punches,
    corrections,
    absences,
    timeOff,
    leaveBanks,
    notifications,
    forgottenClockOut: forgotten
      ? {
          shiftId: forgotten.id,
          startedAt: forgotten.startAt,
          safetyClosedAt: forgotten.safetyClosedAt,
          safetyCloseRule: forgotten.safetyCloseRule,
        }
      : null,
  });
}

export type TimeAdminArea =
  | "overview"
  | "review"
  | "employees"
  | "payroll"
  | "security"
  | "owner";

export type TimeAdminPrincipal = {
  kind: "time" | "command_center";
  role: "owner" | "time_admin";
  actor: string;
  employee: TimeEmployee | null;
  capabilities: TimeCapability[];
  canSecurity: boolean;
  canOwner: boolean;
};

export function isTimeAdminError(
  value: TimeAdminPrincipal | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export function permitsTimeArea(capabilities: TimeCapability[], area: TimeAdminArea): boolean {
  const has = (capability: TimeCapability) => capabilities.includes(capability);
  if (has("timekeeping.owner")) return true;
  if (area === "security") return has("timekeeping.security");
  if (area === "owner") return false;
  if (area === "employees") return has("timekeeping.employees") || has("timekeeping.admin");
  if (area === "payroll") return has("timekeeping.payroll") || has("timekeeping.admin");
  if (area === "review") return has("timekeeping.review") || has("timekeeping.admin");
  return (
    has("timekeeping.review") ||
    has("timekeeping.employees") ||
    has("timekeeping.payroll") ||
    has("timekeeping.admin") ||
    has("timekeeping.security")
  );
}

/**
 * Shared gate for the standalone Time app and the Command Center mirror.
 * A valid pp_time_session is checked first; absent Time cookie falls back to
 * the existing Command Center owner gate. Both paths use the same backend.
 */
export async function requireTimeAdmin(
  request: Request,
  area: TimeAdminArea = "overview",
): Promise<TimeAdminPrincipal | NextResponse> {
  if (timeSessionFromRequest(request)) {
    const employee = await requireTimeEmployee(request);
    if (isTimeEmployeeError(employee)) return employee;
    if (!permitsTimeArea(employee.capabilities, area)) {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }
    return {
      kind: "time",
      role: employee.capabilities.includes("timekeeping.owner") ? "owner" : "time_admin",
      actor: employee.id,
      employee,
      capabilities: employee.capabilities,
      canSecurity:
        employee.capabilities.includes("timekeeping.security") ||
        employee.capabilities.includes("timekeeping.owner"),
      canOwner: employee.capabilities.includes("timekeeping.owner"),
    };
  }

  const gate = await requireApiAuth("timekeeping");
  if (isAuthError(gate)) return gate;
  return {
    kind: "command_center",
    role: "owner",
    actor: "owner",
    employee: null,
    capabilities: [],
    canSecurity: true,
    canOwner: true,
  };
}

/** @deprecated Use requireTimeAdmin(request, area). */
export async function requireTimekeepingAdmin() {
  return requireApiAuth("timekeeping");
}

export async function requireMikeOrOwner(request: Request) {
  if (verifyTimeMikeBearer(request.headers.get("authorization"))) {
    return { kind: "mike" as const };
  }
  const gate = await requireApiAuth("timekeeping");
  if (isAuthError(gate)) return gate;
  return { kind: "owner" as const, session: gate };
}

export { buildTimeSession, isValidPinShape, publicEmployee, randomUUID, verifyTimePin };
