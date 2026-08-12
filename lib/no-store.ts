/** Response init for live metrics/snapshot JSON — never let CDN/browser cache stale ops numbers. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;
