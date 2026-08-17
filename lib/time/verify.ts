import { chicagoParts } from "@/lib/time/chicago";
import { haversineMeters, nearestWorkLocation, verifyGeofence } from "@/lib/time/geofence";
import type {
  GeofenceInput,
  GpsPermissionState,
  NetworkClass,
  PunchEvent,
  PunchRiskReason,
  SecuritySeverity,
  TrustedDevice,
  WorkLocation,
} from "@/lib/time/types";

const LOW_ACCURACY_M = 200;
const IMPOSSIBLE_TRAVEL_MPS = 40; // ~90 mph hard ceiling for review signal
const REVIEW_SCORE_THRESHOLD = 45;

export type PunchEvidenceInput = {
  geo: GeofenceInput | null;
  gpsPermission: GpsPermissionState;
  clientReportedAt?: string | null;
  clientIp: string | null;
  networkClass: NetworkClass;
  officeNetworkMatch: boolean | null;
  device: TrustedDevice | null;
  deviceKnown: boolean;
  newDevice: boolean;
  deviceHint: string | null;
  priorPunches: PunchEvent[];
  activeDeviceCount: number;
  locations: WorkLocation[];
  now: Date;
};

export type PunchEvidenceResult = {
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
  officeNetworkMatch: boolean | null;
  trustedDeviceId: string | null;
  trustedDevice: boolean;
  newDevice: boolean;
  unusualIp: boolean;
  unusualLocation: boolean;
  riskScore: number;
  reviewRequired: boolean;
  reasonCodes: PunchRiskReason[];
  deviceHint: string | null;
  clientReportedAt: string | null;
};

export function evaluatePunchEvidence(input: PunchEvidenceInput): PunchEvidenceResult {
  const reasons = new Set<PunchRiskReason>();
  let score = 0;

  const lat = input.geo && Number.isFinite(input.geo.latitude) ? input.geo.latitude : null;
  const lng = input.geo && Number.isFinite(input.geo.longitude) ? input.geo.longitude : null;
  const accuracyM =
    input.geo?.accuracyM != null && Number.isFinite(input.geo.accuracyM) ? Number(input.geo.accuracyM) : null;
  const gpsCapturedAt = input.geo?.capturedAt || (lat != null ? input.now.toISOString() : null);
  const gpsPermission = input.gpsPermission;

  let locationId: string | null = null;
  let nearestLocationId: string | null = null;
  let nearestLocationName: string | null = null;
  let distanceFromNearestM: number | null = null;
  let geofenceOk = false;
  let geofenceReason: string | null = null;
  let unusualLocation = false;

  if (lat == null || lng == null) {
    if (gpsPermission === "denied") {
      reasons.add("GPS_PERMISSION_DENIED");
      score += 18;
    } else if (gpsPermission !== "import" && gpsPermission !== "not_requested") {
      reasons.add("GPS_UNAVAILABLE");
      score += 12;
    }
    geofenceReason = gpsPermission === "denied" ? "gps_denied" : "gps_unavailable";
  } else {
    if (accuracyM != null && accuracyM > LOW_ACCURACY_M) {
      reasons.add("GPS_LOW_ACCURACY");
      score += 8;
    }
    const nearest = nearestWorkLocation(input.locations, lat, lng);
    if (!nearest) {
      reasons.add("NO_VERIFIED_WORK_LOCATION");
      geofenceReason = "no_verified_location";
      // Informational — job-site punches are expected; do not treat as theft.
      score += 2;
    } else {
      nearestLocationId = nearest.location.id;
      nearestLocationName = nearest.location.name;
      distanceFromNearestM = Math.round(nearest.distanceM);
      const fence = verifyGeofence(input.locations, lat, lng);
      if (fence.ok) {
        geofenceOk = true;
        locationId = fence.location.id;
        geofenceReason = null;
      } else {
        geofenceOk = false;
        geofenceReason = fence.reason;
        unusualLocation = true;
        reasons.add("OUTSIDE_NORMAL_LOCATION");
        // Off-site / job-site work is normal — light signal only.
        score += distanceFromNearestM != null && distanceFromNearestM > 50_000 ? 22 : 10;
      }
    }

    const priorWithGps = [...input.priorPunches]
      .filter((p) => p.latitude != null && p.longitude != null)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    if (priorWithGps?.latitude != null && priorWithGps.longitude != null) {
      const dtSec = Math.max(1, (input.now.getTime() - Date.parse(priorWithGps.occurredAt)) / 1000);
      const dist = haversineMeters(priorWithGps.latitude, priorWithGps.longitude, lat, lng);
      const speed = dist / dtSec;
      if (speed > IMPOSSIBLE_TRAVEL_MPS && dist > 5000) {
        reasons.add("IMPOSSIBLE_TRAVEL");
        score += 55;
      }
    }
  }

  if (input.officeNetworkMatch === true) {
    reasons.add("OFFICE_NETWORK_MATCH");
    score = Math.max(0, score - 15);
  }

  const trusted = Boolean(input.device && input.device.active && !input.device.revokedAt);
  if (!trusted) {
    reasons.add("UNRECOGNIZED_DEVICE");
    score += 25;
  } else if (input.newDevice || !input.deviceKnown) {
    // First observation of this personal device — expected on onboarding; light signal.
    reasons.add("NEW_DEVICE");
    score += 12;
  }

  if (input.activeDeviceCount > 2) {
    reasons.add("MULTIPLE_DEVICES_SAME_EMPLOYEE");
    score += 12;
  }

  let unusualIp = false;
  if (input.clientIp) {
    const seenIp = input.priorPunches.some((p) => p.clientIp === input.clientIp);
    if (!seenIp && input.officeNetworkMatch !== true) {
      unusualIp = true;
      reasons.add("NEW_IP");
      score += 8;
    }
  }

  const parts = chicagoParts(input.now);
  if (parts.hour >= 23 || parts.hour < 5) {
    reasons.add("OVERNIGHT_SHIFT");
    score += 5;
  }

  const reasonCodes = [...reasons];
  const reviewRequired =
    score >= REVIEW_SCORE_THRESHOLD ||
    reasonCodes.includes("IMPOSSIBLE_TRAVEL") ||
    (reasonCodes.includes("NEW_DEVICE") &&
      reasonCodes.includes("OUTSIDE_NORMAL_LOCATION") &&
      reasonCodes.includes("NEW_IP")) ||
    (reasonCodes.includes("UNRECOGNIZED_DEVICE") && reasonCodes.includes("GPS_PERMISSION_DENIED"));

  return {
    latitude: lat,
    longitude: lng,
    accuracyM,
    gpsCapturedAt,
    gpsPermission,
    locationId,
    nearestLocationId,
    nearestLocationName,
    distanceFromNearestM,
    geofenceOk,
    geofenceReason,
    clientIp: input.clientIp,
    networkClass: input.networkClass,
    officeNetworkMatch: input.officeNetworkMatch,
    trustedDeviceId: input.device?.id ?? null,
    trustedDevice: trusted,
    newDevice: input.newDevice,
    unusualIp,
    unusualLocation,
    riskScore: score,
    reviewRequired,
    reasonCodes,
    deviceHint: input.deviceHint,
    clientReportedAt: input.clientReportedAt || null,
  };
}

/**
 * Severity for Mason/Michelle security queue.
 * LOW signals are retained on the punch but do not open an alert by themselves.
 */
export function computeSecuritySeverity(punch: PunchEvent): SecuritySeverity {
  const r = new Set(punch.reasonCodes);
  if (r.has("IMPOSSIBLE_TRAVEL")) return "HIGH";
  if (r.has("UNRECOGNIZED_DEVICE") && r.has("GPS_PERMISSION_DENIED")) return "HIGH";
  if (r.has("NEW_DEVICE") && r.has("OUTSIDE_NORMAL_LOCATION") && r.has("NEW_IP")) return "HIGH";
  if (r.has("MULTIPLE_DEVICES_SAME_EMPLOYEE") && (r.has("NEW_IP") || r.has("OUTSIDE_NORMAL_LOCATION"))) {
    return "HIGH";
  }
  if (punch.riskScore >= 55) return "HIGH";

  if (r.has("NEW_DEVICE") || r.has("UNRECOGNIZED_DEVICE")) return "MEDIUM";
  if (r.has("MULTIPLE_DEVICES_SAME_EMPLOYEE")) return "MEDIUM";
  if (r.has("GPS_PERMISSION_DENIED")) return "MEDIUM";
  if (r.has("GPS_UNAVAILABLE") && !punch.trustedDevice) return "MEDIUM";
  if (
    r.has("OUTSIDE_NORMAL_LOCATION") &&
    punch.distanceFromNearestM != null &&
    punch.distanceFromNearestM > 50_000
  ) {
    return "MEDIUM";
  }
  if (punch.reviewRequired) return "MEDIUM";

  // Trusted device + new IP (or similar soft signals) = LOW — evidence only.
  return "LOW";
}

/** Mason/Michelle alert headline — review signal language, never accusation. */
export function securityAlertSummary(punch: PunchEvent, employeeName: string): string {
  const severity = computeSecuritySeverity(punch);
  const flags: string[] = [];
  if (punch.reasonCodes.includes("IMPOSSIBLE_TRAVEL")) flags.push("Impossible travel");
  if (punch.newDevice) flags.push("New device");
  if (!punch.trustedDevice) flags.push("Unrecognized device");
  if (punch.reasonCodes.includes("MULTIPLE_DEVICES_SAME_EMPLOYEE")) flags.push("Multiple devices");
  if (punch.unusualIp) flags.push("Unusual IP");
  if (punch.gpsPermission === "denied") flags.push("GPS denied");
  else if (punch.latitude == null) flags.push("GPS unavailable");
  else if (punch.unusualLocation && punch.nearestLocationName && punch.distanceFromNearestM != null) {
    const miles = (punch.distanceFromNearestM / 1609.344).toFixed(1);
    flags.push(`${miles} mi from ${punch.nearestLocationName}`);
  }
  if (punch.networkClass === "OTHER_NETWORK") flags.push("Non-office network");
  return `${severity} · ${employeeName} · ${punch.type.replace("_", " ")} · ${flags.join(" · ") || "Review signal"}`;
}

/** @deprecated Security alerts are Mason/Michelle — not Shelly. Prefer securityAlertSummary. */
export function shellyPunchWarningSummary(punch: PunchEvent, employeeName: string): string {
  return securityAlertSummary(punch, employeeName);
}
