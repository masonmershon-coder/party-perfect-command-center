/** Single source of truth for Command Center + Jobs release metadata. */
export const APP_VERSION = "1.8.3";

/** ISO date of this release (YYYY-MM-DD). */
export const APP_RELEASED_AT = "2026-08-09";

export const APP_RELEASE_LABEL = `v${APP_VERSION} · ${APP_RELEASED_AT}`;

export const APP_RELEASE_NOTES = {
  commandCenter: [
    "Hiring daily goal raised to 5–25 apps (Tulsa) to match scale plan",
    "Quoting photos: multi tablescape + handwritten ticket OCR; Madison offers 2 SKUs and learns picks",
    "Overbook banner lists which items are short; reviewed/sent override with required reason",
    "Shared queue copy clarifies draft→reviewed→sent — still no POR write",
  ],
  jobs: [
    "Quick Apply first: name, phone, city, role in under 60s — essays/resume optional after",
    "Optional weekends/early mornings + lift/~50lb outdoor screeners on the fast path",
    "“Add more to stand out” continuation after submit — never gates the application",
    "Hiring daily goal 5–25 to push toward scale",
  ],
} as const;

export function getAppVersionPayload() {
  return {
    version: APP_VERSION,
    releasedAt: APP_RELEASED_AT,
    label: APP_RELEASE_LABEL,
  };
}
