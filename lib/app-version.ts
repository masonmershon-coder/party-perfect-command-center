/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.8.4";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-10";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Server cookie login (AUTH_PASSWORD) — fixes stuck “Checking session” / login 500",
    "API routes gated with session auth; owner PIN for bookkeeping/reports",
    "Quoting: glassware rack sizing, stronger catalog search, confirm dialogs",
    "Home Open AR from POR; sync agent AR = positive balances / active customers",
  ],
  jobs: [
    "Quick Apply live: name, phone, city, role in under 60s",
    "Optional screeners + “Add more to stand out” after submit",
    "Hiring daily goal 5–25",
    "Apply rate limits + server validation for quick/enrich modes",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
