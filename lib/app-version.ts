/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.3.1";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-07-30";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Upstash Redis durable store for POR, emails, Mike chat",
    "Live POR read-only snapshot API (POST /api/por/sync)",
    "Inventory / Bookkeeping / Dashboard prefer POR mirror when present",
    "Mike chat soft-persists when storage is recovering",
  ],
  jobs: [
    "PartyPerfectJobs apply experience (/jobs)",
    "Multi-role application form + Mike Grok scoring",
    "Append-only Redis applications + email backup every submit",
    "Domain middleware for partyperfectjobs.com (see docs/JOBS_DNS.md)",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
