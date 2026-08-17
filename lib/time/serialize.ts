import type {
  LeaveBank,
  PunchEvent,
  TimeAbsence,
  TimeCorrection,
  TimeEmployee,
  TimeNotification,
  TimeOffRequest,
  TimeShift,
  TrustedDevice,
  WorkLocation,
  ClockStatus,
} from "@/lib/time/types";
import { formatHours } from "@/lib/time/hours";
import { nextAllowedPunches } from "@/lib/time/punch";
import { computeSecuritySeverity } from "@/lib/time/verify";
import {
  computeSetupStatus,
  deviceStatusLabel,
  hasPinConfigured,
  isProtectedOwnerEmployee,
  pinStatusLabel,
  shellyRoleFromCaps,
  timeOnboardingUrl,
  timeStatusLabel,
} from "@/lib/time/employee-admin";

export function publicEmployee(e: TimeEmployee) {
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    preferredName: e.preferredName,
    firstName: e.firstName,
    lastName: e.lastName,
    phoneLast4: e.phoneLast4,
    active: e.active,
    department: e.department,
    title: e.title,
    capabilities: e.capabilities,
    ptoEligible: e.ptoEligible,
    vacationEligible: e.vacationEligible,
    onboardingStatus: e.onboardingStatus,
    startDate: e.startDate ?? null,
    notes: e.notes ?? "",
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/**
 * Shelly employee admin row — no PIN plaintext, no IP/GPS/security telemetry.
 */
export function shellyEmployeeAdminView(e: TimeEmployee, devices: TrustedDevice[]) {
  const setupStatus = computeSetupStatus(e, devices);
  return {
    ...publicEmployee(e),
    pinConfigured: hasPinConfigured(e),
    pinStatus: pinStatusLabel(e),
    deviceStatus: deviceStatusLabel(devices),
    timeStatus: timeStatusLabel(e),
    setupStatus,
    role: isProtectedOwnerEmployee(e) ? "owner_protected" : shellyRoleFromCaps(e.capabilities),
    protected: isProtectedOwnerEmployee(e),
    activeDeviceCount: devices.filter((d) => d.active && !d.revokedAt).length,
    onboardingUrl: timeOnboardingUrl(),
  };
}

export function publicPunchForEmployee(p: PunchEvent) {
  return {
    id: p.id,
    type: p.type,
    occurredAt: p.occurredAt,
    timezone: p.timezone || "America/Chicago",
    shiftId: p.shiftId,
    source: p.source,
    sourceLabel:
      p.source === "import"
        ? "Imported from Square"
        : p.source === "admin_correction"
          ? "Admin correction"
          : p.source === "system_safety_close"
            ? "System close"
            : null,
  };
}

/**
 * Shelly-safe punch summary for operational cleanup only.
 * No IP, risk scores, device-risk history, or fraud scoring.
 */
export function shellyOpsPunchView(p: PunchEvent) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    type: p.type,
    occurredAt: p.occurredAt,
    timezone: p.timezone,
    shiftId: p.shiftId,
    source: p.source,
    /** Ops-only: whether location was available for the punch — not security telemetry. */
    locationAvailable: p.latitude != null && p.longitude != null,
    nearestLocationName: p.nearestLocationName,
  };
}

/**
 * Mason / Michelle — full punch evidence for security oversight.
 * Review signals only; never presented as automatic guilt.
 */
export function adminPunchDetail(p: PunchEvent) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    type: p.type,
    occurredAt: p.occurredAt,
    ingestedAt: p.ingestedAt,
    timezone: p.timezone,
    clientReportedAt: p.clientReportedAt,
    gps: {
      available: p.latitude != null && p.longitude != null,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracyM: p.accuracyM,
      capturedAt: p.gpsCapturedAt,
      permission: p.gpsPermission,
      geofenceOk: p.geofenceOk,
      geofenceReason: p.geofenceReason,
      nearestLocationId: p.nearestLocationId,
      nearestLocationName: p.nearestLocationName,
      distanceFromNearestM: p.distanceFromNearestM,
      locationId: p.locationId,
    },
    network: {
      class: p.networkClass,
      officeNetworkMatch: p.officeNetworkMatch,
      clientIp: p.clientIp,
    },
    device: {
      trustedDeviceId: p.trustedDeviceId,
      trusted: p.trustedDevice,
      newDevice: p.newDevice,
      hint: p.deviceHint,
    },
    verification: {
      unusualIp: p.unusualIp,
      unusualLocation: p.unusualLocation,
      riskScore: p.riskScore,
      reviewRequired: p.reviewRequired,
      reasonCodes: p.reasonCodes,
      severity: computeSecuritySeverity(p),
      reviewedAt: p.reviewedAt,
      reviewedBy: p.reviewedBy,
    },
    source: p.source,
    shiftId: p.shiftId,
  };
}

export function publicLocation(l: WorkLocation) {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    latitude: l.latitude,
    longitude: l.longitude,
    radiusM: l.radiusM,
    active: l.active,
    verified: l.verified,
    notes: l.notes,
  };
}

/** Leave banks are only attached when the employee is eligible. Never emit empty/"not eligible". */
export function employeeMePayload(input: {
  employee: TimeEmployee;
  status: ClockStatus;
  todaySeconds: number;
  weekSeconds: number;
  shift: TimeShift | null;
  punches: PunchEvent[];
  corrections: TimeCorrection[];
  absences: TimeAbsence[];
  timeOff: TimeOffRequest[];
  leaveBanks: LeaveBank[];
  notifications: TimeNotification[];
  forgottenClockOut?: {
    shiftId: string;
    startedAt: string;
    safetyClosedAt: string | null;
    safetyCloseRule: string | null;
  } | null;
}) {
  const showLeave = input.employee.ptoEligible || input.employee.vacationEligible;
  const leave = showLeave
    ? input.leaveBanks.filter((b) => {
        if (b.type === "pto") return input.employee.ptoEligible;
        if (b.type === "vacation") return input.employee.vacationEligible;
        return false;
      })
    : [];
  return {
    employee: publicEmployee(input.employee),
    status: input.status,
    nextPunches: nextAllowedPunches(input.status),
    todayHours: formatHours(input.todaySeconds),
    weekHours: formatHours(input.weekSeconds),
    todaySeconds: input.todaySeconds,
    weekSeconds: input.weekSeconds,
    timezone: "America/Chicago",
    openShift: input.shift,
    punches: input.punches.map(publicPunchForEmployee),
    corrections: input.corrections,
    absences: input.absences,
    timeOff: input.timeOff,
    leave,
    leaveVisible: showLeave && leave.length > 0,
    notifications: input.notifications,
    unreadNotificationCount: input.notifications.filter((n) => !n.readAt).length,
    forgottenClockOut: input.forgottenClockOut ?? null,
  };
}
