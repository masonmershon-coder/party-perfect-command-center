/**
 * Live Command Center host (typo domain until SSL cutover).
 * Override with NEXT_PUBLIC_APP_URL when partyperfectcommand.app is ready.
 */
const DEFAULT_APP_URL = "https://partyperfectcomand.app";

export function getPublicAppUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_APP_URL;
}

export function appUrl(path = "/") {
  const base = getPublicAppUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
