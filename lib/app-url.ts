/**
 * Live Command Center host.
 * Override in Vercel with NEXT_PUBLIC_APP_URL / APP_URL if needed.
 */
const DEFAULT_APP_URL = "https://partyperfect.app";

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
