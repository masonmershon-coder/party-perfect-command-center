/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.5.9";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-06";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Hiring: open applicant resumes + schooling on Mike review cards",
    "Madison Design look board: multi photo + video uploads, still returns 2 looks",
    "Madison Design Studio: website inventory catalog for exact rental matches",
    "Phone-friendly Command Center + Jobs Safari findability",
  ],
  jobs: [
    "Thank-you only after apply — no department fit shown to applicants",
    "Optional resume upload (PDF/Word/photo) visible in Command Center Hiring",
    "Schooling questions: high school / GED + college status",
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
