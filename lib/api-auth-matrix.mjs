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
];

export const MACHINE_API_PREFIXES = [
  "/api/por/sync",
  "/api/cron/social",
  "/api/cron/weekly-recap",
];

const OWNER_ONLY = new Set([
  "marketing",
  "bookkeeping",
  "reports",
  "admin",
  "sms_ops",
]);

export function roleHasPermission(role, permission) {
  if (role === "owner") return true;
  if (permission === "session") return true;
  if (OWNER_ONLY.has(permission)) return false;
  return true;
}
