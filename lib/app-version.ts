/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.6.3";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-06";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Madison Design: keep exact showroom linens/chairs — no fantasy venue rebuilds",
    "Flux Inventory Edit pulls website catalog SKUs with the look board",
    "Primary host is partyperfect.app — old command domains redirect safely",
    "Employee view hides Bookkeeping / Marketing / Reports until Owner unlock",
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
