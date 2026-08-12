/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.9.1";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-11";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Owner PIN restored to 4-digit OWNER_ADMIN_CODE (mobile unlock kept)",
    "POR 2.0 rentable stock metrics + DEMO chips",
  ],
  jobs: [
    "Full multi-step application restored (Quick Apply removed)",
    "Rate-limit, honeypot, validation, and Mike scoring kept",
    "Pay $18–$28/hr · daily goal 25 apps",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
