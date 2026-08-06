/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.6.5";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-06";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Design Studio simplified — Madison matches inventory in the background",
    "Madison auto-syncs website inventory and vision-matches SKUs from your photo",
    "Madison Design: keep exact showroom linens/chairs — no fantasy venue rebuilds",
    "Primary host is partyperfect.app — old command domains redirect safely",
  ],
  jobs: [
    "Schooling box on step 1 is clearer (high school/GED + college required)",
    "Thank-you only after apply — no department fit shown to applicants",
    "Optional resume upload (PDF/Word/photo) visible in Command Center Hiring",
    "Multi-role application form + Mike Grok scoring",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
