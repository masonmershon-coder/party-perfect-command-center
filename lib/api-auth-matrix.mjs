/**
 * Pure helpers for scripts/test-api-auth-matrix.mjs (no Next.js imports).
 * Keep in sync with lib/api-auth.ts permission rules.
 */

export const PRIVATE_CACHE_VALUE =
  "private, no-store, max-age=0, must-revalidate";

export const PUBLIC_API_ROUTE_PATHS = [
  "/api/auth/session",
  "/api/auth/meta/callback",
  "/api/auth/google-ads/callback",
  "/api/jobs/apply",
  "/api/health",
  "/api/sms/inbound",
  "/api/get-quote/inquiry",
  "/api/time/session",
];

export const MACHINE_API_PREFIXES = [
  "/api/por/sync",
  "/api/cron/social",
  "/api/cron/weekly-recap",
  "/api/cron/time-square-sync",
  "/api/mike/intake",
  "/api/ai-cost/ingest",
  "/api/time/mike",
];

const OWNER_ONLY = new Set([
  "marketing",
  "bookkeeping",
  "reports",
  "admin",
  "sms_ops",
  "security",
  "ai_cost",
  "timekeeping",
]);

export function roleHasPermission(role, permission) {
  if (role === "owner") return true;
  if (permission === "session") return true;
  if (OWNER_ONLY.has(permission)) return false;
  return true;
}
