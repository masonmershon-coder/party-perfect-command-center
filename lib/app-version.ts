/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.9.0";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-11";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "POR 2.0 P0: exclude fee cats 19+34 + fee-named lines from all stock math",
    "Canonical metrics (items_out_rentable, deliveries_today, …) shared by dashboard + Mike",
    "Clamp negative qtys; Fees & Services inventory tab; mobile Owner unlock",
    "Employee sessions: financials absent from agent context (opt-in owner only)",
  ],
  jobs: [
    "Quick Apply + enrich code-split",
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
