/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.6.9";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-07";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Madison matches against the full 8,979-item POR catalog (not just snapshot sample)",
    "Mike chat upgraded to Grok 4.3 + clearer applicant photo search links",
    "Monday weekly recap emails to info@mershonevents.com (SMS still optional)",
    "Madison scene placement — put this table in a garden/warehouse, not a filter",
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
