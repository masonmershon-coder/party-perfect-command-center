/**
 * Preview/test flags for Party Perfect Time.
 * TIME_PREVIEW=1 → safe phone testing (not production SoT).
 * Never enable geofence relax on production without Mason.
 */

export function isTimePreview(): boolean {
  return process.env.TIME_PREVIEW === "1" || process.env.TIME_PREVIEW === "true";
}

/** Allow punches outside showroom fence on preview only (home iPhone testing). */
export function isTimePreviewGeofenceRelaxed(): boolean {
  if (!isTimePreview()) return false;
  return (
    process.env.TIME_PREVIEW_RELAX_GEOFENCE === "1" ||
    process.env.TIME_PREVIEW_RELAX_GEOFENCE === "true"
  );
}

/** Approximate PP Showroom for preview seed only — not Mason-verified production coords. */
export const PREVIEW_SHOWROOM_COORDS = {
  latitude: 36.1047,
  longitude: -95.8873,
  radiusM: 200,
} as const;

export function timePreviewPublicMeta() {
  return {
    preview: isTimePreview(),
    geofenceRelaxed: isTimePreviewGeofenceRelaxed(),
    banner: isTimePreview()
      ? "PREVIEW — off-site punches allowed; GPS/IP/device are review signals. Not live payroll."
      : null,
  };
}
