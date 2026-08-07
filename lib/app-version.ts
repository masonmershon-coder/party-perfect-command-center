/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.7.2";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-07";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "POR sync pushes live full catalog (NUM) + reservations every 10 min",
    "Quote availability-by-date — overbook/tight warnings via ItemFile.NUM join",
    "Quote assembly API — buildQuote → tax/waiver/deposit + ticket + email draft",
    "Madison matches against the full 8,979-item POR catalog (not just snapshot sample)",
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
