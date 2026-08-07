/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.8.2";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-07";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Quoting photos: multi tablescape + handwritten ticket OCR; Madison offers 2 SKUs and learns picks",
    "Overbook banner lists which items are short; reviewed/sent override with required reason",
    "Shared queue copy clarifies draft→reviewed→sent — still no POR write",
    "Overbooking guard on approve — hard overbooks return 409 unless overridden",
  ],
  jobs: [
    "One-tap “How’d you hear about us?” — stays quick, not a slog",
    "Schooling box on step 1 is clearer (high school/GED + college required)",
    "Thank-you only after apply — no department fit shown to applicants",
    "Optional resume upload (PDF/Word/photo) visible in Command Center Hiring",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
