/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.9.7";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-13";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Design pipeline: image ingest → cutout cache → resolver → availability → staging",
    "Catalog-images subbot on each sync batch (hash skip, Blob mirror, birefnet cutout)",
    "Madison text-only commands use pipeline (single FAL staging call)",
  ],
  jobs: [
    "Quick Apply / 60-second apply removed — full application only",
    "Required: contact, city, eligibility, DL, schooling, referral, transport, physical, availability, work history",
    "Mike scoring + Command Center hiring record unchanged (same field contract)",
    "Hiring pipeline: ?src= attribution, Grok fallback visible, JobPosting schema module",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
