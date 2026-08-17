export const TIME_TZ = "America/Chicago";

export type TimeCapability =
  | "punch"
  | "self_history"
  | "self_request"
  | "timekeeping.review"
  | "timekeeping.employees"
  | "timekeeping.admin"
  | "timekeeping.payroll"
  | "timekeeping.manager"
  /** Mason / Michelle — security & time-theft oversight (not Shelly). */
  | "timekeeping.security"
  /** Michelle only — final payroll / owner overrides. */
  | "timekeeping.owner";

/** Review-signal severity for Mason/Michelle. Never auto-accuses theft. */
export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH";

export type PunchType = "clock_in" | "lunch_start" | "lunch_end" | "clock_out";

export type ClockStatus = "NOT_CLOCKED_IN" | "CLOCKED_IN" | "ON_LUNCH";

export type PunchSource = "app" | "import" | "admin_correction" | "system_safety_close";

/** How a shift was closed — system safety close is never employee-confirmed. */
export type ShiftCloseKind = "none" | "employee" | "admin" | "system_pending_correction";

/**
 * Payroll authority for worked hours.
 * Never treat SYSTEM_ESTIMATED / PENDING_CORRECTION as unquestioned worked time.
 */
export type HoursAuthority =
  | "EMPLOYEE_CONFIRMED"
  | "ADMIN_APPROVED"
  | "SYSTEM_ESTIMATED"
  | "PENDING_CORRECTION";

export type TimeSettings = {
  /** Admin-configurable; default 16 for long event/delivery days. */
  maxOpenShiftHours: number;
  /** Chicago hour (0–23) for optional overnight safety sweep. */
  overnightSafetyCheckHourChicago: number;
  /**
   * Late-night window (Chicago): 19:00 through 06:00 next morning.
   * Fee is dollars per late-night occurrence. null = Mason has not set the amount yet.
   */
  lateNightFeeAmount: number | null;
  lateNightWindowStartHourChicago: number;
  lateNightWindowEndHourChicago: number;
  /**
   * Shadow Mode: Square remains punch authority; PP Time syncs read-only for management.
   * Employees must NOT punch in PP Time for payroll until cutover.
   */
  shadowMode: boolean;
  squareSyncHealth: "HEALTHY" | "DELAYED" | "FAILED" | "OFF" | "NOT_CONFIGURED";
  squareLastSuccessfulSyncAt: string | null;
  squareLastAttemptedSyncAt: string | null;
  squareLastError: string | null;
  squareLastCheckpoint: string | null;
  squareEmployeesSynced: number;
  squareShiftsSynced: number;
  squareOpenShifts: number;
  squareConflicts: number;
  historicalImportThrough: string | null;
  liveSyncStartedAt: string | null;
};

export const DEFAULT_TIME_SETTINGS: TimeSettings = {
  maxOpenShiftHours: 16,
  overnightSafetyCheckHourChicago: 4,
  lateNightFeeAmount: null,
  lateNightWindowStartHourChicago: 19,
  lateNightWindowEndHourChicago: 6,
  shadowMode: true,
  squareSyncHealth: "NOT_CONFIGURED",
  squareLastSuccessfulSyncAt: null,
  squareLastAttemptedSyncAt: null,
  squareLastError: null,
  squareLastCheckpoint: null,
  squareEmployeesSynced: 0,
  squareShiftsSynced: 0,
  squareOpenShifts: 0,
  squareConflicts: 0,
  historicalImportThrough: null,
  liveSyncStartedAt: null,
};

/** One Late Night occurrence tied to a single shift (never double-count overnight). */
export type LateNightOccurrence = {
  shiftId: string;
  employeeId: string;
  /** Chicago civil date used for payroll display (shift start date). */
  occurrenceDate: string;
  shiftStartAt: string;
  shiftEndAt: string;
};

/** Employee-facing absence reasons. Not payroll codes. */
export type AbsenceReason = "Sick" | "Vacation" | "Personal" | "Other";

/** Shelly/Michelle administrative classification after review. */
export type AbsenceAdminClass =
  | "unclassified"
  | "sick"
  | "vacation"
  | "personal"
  | "pto"
  | "unpaid"
  | "other";

export type CorrectionIssueType =
  | "forgot_clock_in"
  | "forgot_clock_out"
  | "forgot_lunch_start"
  | "forgot_lunch_end"
  | "wrong_time"
  | "other";

export type ApprovalState =
  | "pending"
  | "needs_clarification"
  | "approved"
  | "denied";

export type PayPeriodStatus = "open" | "review" | "finalized";

export type LeaveType = "pto" | "vacation";

export type RequestKind = "correction" | "absence" | "time_off";

export type TimeOffReason =
  | "doctors_appointment"
  | "vacation"
  | "personal_day"
  | "other";

export type OnboardingStatus =
  | "invited"
  | "first_opened"
  | "installed_help_shown"
  | "login_configured"
  | "active";

/**
 * Shelly-facing setup status (computed).
 * NOT_SET_UP → INVITED → DEVICE_REGISTERED → ACTIVE (or INACTIVE).
 */
export type EmployeeSetupStatus =
  | "NOT_SET_UP"
  | "INVITED"
  | "DEVICE_REGISTERED"
  | "ACTIVE"
  | "INACTIVE";

/** Shelly may assign ordinary employee or timekeeping helper — never Owner/security. */
export type ShellyAssignableRole = "employee" | "timekeeping";

export type TimeEmployee = {
  id: string;
  /** Internal only — not required in employee-facing Time login. */
  employeeNumber: string;
  preferredName: string;
  firstName: string;
  lastName: string;
  phoneLast4: string | null;
  active: boolean;
  department: string;
  title: string;
  pinHash: string;
  capabilities: TimeCapability[];
  ptoEligible: boolean;
  vacationEligible: boolean;
  onboardingStatus: OnboardingStatus;
  /** ISO date (YYYY-MM-DD) or null. */
  startDate: string | null;
  notes: string;
  /**
   * Bumped on PIN reset / device revoke / deactivate to invalidate login sessions.
   * Never log PIN values with this.
   */
  credentialsVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  active: boolean;
  verified: boolean;
  notes: string;
};

/** GPS permission / capture result — never invent coordinates from IP. */
export type GpsPermissionState =
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout"
  | "not_requested"
  | "import";

export type NetworkClass = "PARTY_PERFECT_NETWORK" | "OTHER_NETWORK" | "UNKNOWN";

/**
 * Review signals only — never automatic guilt.
 * Security/anomaly visibility: Mason (primary) + Michelle (owner).
 * Shelly does not receive these by default.
 */
export type PunchRiskReason =
  | "NEW_DEVICE"
  | "UNRECOGNIZED_DEVICE"
  | "NEW_IP"
  | "OUTSIDE_NORMAL_LOCATION"
  | "GPS_PERMISSION_DENIED"
  | "GPS_LOW_ACCURACY"
  | "GPS_UNAVAILABLE"
  | "OFFICE_NETWORK_MATCH"
  | "KNOWN_JOB_SITE"
  | "OVERNIGHT_SHIFT"
  | "IMPOSSIBLE_TRAVEL"
  | "MULTIPLE_DEVICES_SAME_EMPLOYEE"
  | "NO_VERIFIED_WORK_LOCATION";

/** First-party trusted personal device — not IP identity, not invasive fingerprinting. */
export type TrustedDevice = {
  id: string;
  employeeId: string;
  label: string | null;
  platformHint: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
  revokedAt: string | null;
};

/**
 * Raw IP / GPS / device evidence retention default (days).
 * Admins may shorten later; do not keep forever by accident.
 */
export const PUNCH_EVIDENCE_RETENTION_DAYS = 365;

export type PunchEvent = {
  id: string;
  employeeId: string;
  type: PunchType;
  /** Authoritative server-received time (UTC ISO). */
  occurredAt: string;
  ingestedAt: string;
  timezone: string;
  /** Client-reported clock if provided — never sole authority. */
  clientReportedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  gpsCapturedAt: string | null;
  gpsPermission: GpsPermissionState;
  locationId: string | null;
  nearestLocationId: string | null;
  nearestLocationName: string | null;
  distanceFromNearestM: number | null;
  geofenceOk: boolean;
  geofenceReason: string | null;
  clientIp: string | null;
  networkClass: NetworkClass;
  /** null = office IPs not configured / unknown */
  officeNetworkMatch: boolean | null;
  trustedDeviceId: string | null;
  trustedDevice: boolean;
  newDevice: boolean;
  unusualIp: boolean;
  unusualLocation: boolean;
  riskScore: number;
  reviewRequired: boolean;
  reasonCodes: PunchRiskReason[];
  reviewedAt: string | null;
  reviewedBy: string | null;
  source: PunchSource;
  idempotencyKey: string;
  shiftId: string | null;
  deviceHint: string | null;
};

export type TimeShift = {
  id: string;
  employeeId: string;
  startAt: string;
  endAt: string | null;
  lunchStartAt: string | null;
  lunchEndAt: string | null;
  status: "open" | "on_lunch" | "closed" | "exception" | "pending_correction";
  paidSeconds: number | null;
  lunchSeconds: number | null;
  source: PunchSource;
  payPeriodId: string | null;
  importedRegularHours: number | null;
  importedOvertimeHours: number | null;
  importedDoubletimeHours: number | null;
  closeKind: ShiftCloseKind;
  hoursAuthority: HoursAuthority;
  safetyClosedAt: string | null;
  safetyCloseRule: string | null;
  /** Correction id after employee submits “what time did you finish?” */
  employeeCorrectionId: string | null;
};

export type TimeCorrection = {
  id: string;
  employeeId: string;
  shiftId: string | null;
  punchId: string | null;
  affectedDate: string;
  issueType: CorrectionIssueType;
  requestedCorrection: string;
  /** Immutable employee note — never overwritten by manager remark. */
  employeeExplanation: string;
  /** Separate Shelly/Michelle remark. */
  adminRemark: string;
  approvedCorrection: string;
  state: ApprovalState;
  queue: "shelly" | "michelle";
  decidedBy: string | null;
  decidedAt: string | null;
  /** Snapshot of original punches/shift at request time. */
  originalSnapshot: string;
  createdAt: string;
  updatedAt: string;
};

export type TimeAbsence = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  /** Simple employee reason — not a payroll code. */
  reason: AbsenceReason;
  /** Shelly sets after review; absence report ≠ automatic PTO. */
  adminClass: AbsenceAdminClass;
  paid: boolean;
  leaveHoursApplied: number | null;
  employeeNote: string;
  managerRemark: string;
  state: ApprovalState;
  queue: "shelly" | "michelle";
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Future planned time-off (architected in V1; matures after core clocking). */
export type TimeOffRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: TimeOffReason;
  employeeNote: string;
  managerRemark: string;
  state: ApprovalState;
  queue: "shelly" | "michelle";
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RequestMessage = {
  id: string;
  requestKind: RequestKind;
  requestId: string;
  authorRole: "employee" | "shelly" | "michelle" | "system";
  authorId: string;
  body: string;
  createdAt: string;
};

export type TimeNotification = {
  id: string;
  employeeId: string;
  title: string;
  body: string;
  requestKind: RequestKind | null;
  requestId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type LeaveBank = {
  id: string;
  employeeId: string;
  type: LeaveType;
  grantedHours: number;
  usedHours: number;
};

export type LeaveTransaction = {
  id: string;
  bankId: string;
  employeeId: string;
  type: LeaveType;
  deltaHours: number;
  reason: string;
  approvedBy: string | null;
  at: string;
};

export type TimeSchedule = {
  id: string;
  employeeId: string;
  locationId: string | null;
  startAt: string;
  endAt: string;
  department: string;
};

export type PayPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  finalizedBy: string | null;
  finalizedAt: string | null;
};

export type TimeAudit = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
};

export type SquareImportRun = {
  id: string;
  fileHash: string;
  fileName: string;
  dryRun: boolean;
  committed: boolean;
  createdAt: string;
  resultJson: string;
};

export type GeofenceInput = {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  capturedAt?: string | null;
  permission?: GpsPermissionState;
};

/** Defaults for imported / legacy punches missing evidence fields. */
export function blankPunchEvidence(
  overrides: Partial<PunchEvent> &
    Pick<PunchEvent, "id" | "employeeId" | "type" | "occurredAt" | "idempotencyKey" | "source">,
): PunchEvent {
  return {
    ingestedAt: overrides.occurredAt,
    timezone: TIME_TZ,
    clientReportedAt: null,
    latitude: null,
    longitude: null,
    accuracyM: null,
    gpsCapturedAt: null,
    gpsPermission: "import",
    locationId: null,
    nearestLocationId: null,
    nearestLocationName: null,
    distanceFromNearestM: null,
    geofenceOk: false,
    geofenceReason: null,
    clientIp: null,
    networkClass: "UNKNOWN",
    officeNetworkMatch: null,
    trustedDeviceId: null,
    trustedDevice: false,
    newDevice: false,
    unusualIp: false,
    unusualLocation: false,
    riskScore: 0,
    reviewRequired: false,
    reasonCodes: [],
    reviewedAt: null,
    reviewedBy: null,
    shiftId: null,
    deviceHint: null,
    ...overrides,
  };
}

/** @deprecated Prefer AbsenceReason for employee submissions. */
export type AbsenceCategory = AbsenceReason | "PTO" | "Unpaid";
