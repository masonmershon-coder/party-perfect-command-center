import type { WorkLocation } from "@/lib/time/types";

const EARTH_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeofenceResult =
  | { ok: true; location: WorkLocation; distanceM: number }
  | { ok: false; reason: "no_verified_location" | "outside" | "invalid_coords"; location: WorkLocation | null };

/** Nearest active+verified work location, even when outside the fence (evidence only). */
export function nearestWorkLocation(
  locations: WorkLocation[],
  latitude: number,
  longitude: number,
): { location: WorkLocation; distanceM: number } | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const active = locations.filter(
    (l) => l.active && l.verified && l.latitude != null && l.longitude != null,
  );
  let best: { location: WorkLocation; distanceM: number } | null = null;
  for (const loc of active) {
    const distanceM = haversineMeters(latitude, longitude, loc.latitude!, loc.longitude!);
    if (!best || distanceM < best.distanceM) best = { location: loc, distanceM };
  }
  return best;
}

export function verifyGeofence(
  locations: WorkLocation[],
  latitude: number,
  longitude: number,
): GeofenceResult {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, reason: "invalid_coords", location: null };
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { ok: false, reason: "invalid_coords", location: null };
  }
  const nearest = nearestWorkLocation(locations, latitude, longitude);
  if (!nearest) {
    return { ok: false, reason: "no_verified_location", location: null };
  }
  if (nearest.distanceM <= nearest.location.radiusM) {
    return { ok: true, location: nearest.location, distanceM: nearest.distanceM };
  }
  return { ok: false, reason: "outside", location: nearest.location };
}

export function employeeGeofenceMessage(reason: GeofenceResult["ok"] extends true ? never : GeofenceResult extends { reason: infer R } ? R : string): string {
  if (reason === "no_verified_location") {
    return "Clocking is not available yet. An approved Party Perfect location has not been verified.";
  }
  if (reason === "invalid_coords") {
    return "We could not read your location. Turn on Location for Party Perfect Time and try again.";
  }
  return "You're not at an approved Party Perfect location.";
}
