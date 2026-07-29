/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.2.1";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-07-29";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Team login + owner PIN gate",
    "Live Mode + Mike ops checks",
    "Meta/Facebook + Instagram connect flow (token not connected yet)",
    "IMAP email sync wiring (GoDaddy auth still failing)",
  ],
  jobs: [
    "PartyPerfectJobs apply experience (/jobs)",
    "Multi-role application form + Mike Grok scoring",
    "Domain middleware for partyperfectjobs.com (DNS not pointed yet)",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
