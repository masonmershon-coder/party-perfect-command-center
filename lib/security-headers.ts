/**
 * SEC-HEADERS-001 — Command Center security header set.
 * Applied via next.config.ts `headers()`. Do not weaken for convenience.
 *
 * CSP allowlist covers Design Studio (fal.ai, blob), Meta/Google OAuth,
 * Upstash, xAI, Twilio, and Vercel live preview — identified before lock-down.
 */

export const SECURITY_HEADER_ENTRIES: Array<{ key: string; value: string }> = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self' https://partyperfect.app https://www.partyperfect.app https://partyperfectjobs.com https://www.partyperfectjobs.com",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      [
        "connect-src 'self'",
        "https://*.fal.ai",
        "https://fal.ai",
        "https://*.fal.run",
        "https://fal.run",
        "https://queue.fal.run",
        "https://*.public.blob.vercel-storage.com",
        "https://blob.vercel-storage.com",
        "https://*.upstash.io",
        "https://*.upstash.com",
        "https://graph.facebook.com",
        "https://*.facebook.com",
        "https://*.googleapis.com",
        "https://*.google.com",
        "https://accounts.google.com",
        "https://api.x.ai",
        "https://*.x.ai",
        "https://*.twilio.com",
        "https://*.supabase.co",
        "https://*.supabase.com",
        "https://vercel.live",
        "wss:",
        "ws:",
      ].join(" "),
      "worker-src 'self' blob:",
    ].join("; "),
  },
];

export const API_CORS_ALLOW_ORIGINS = [
  "https://partyperfect.app",
  "https://www.partyperfect.app",
  "https://partyperfectjobs.com",
  "https://www.partyperfectjobs.com",
  "https://partyperfecteventrental.com",
  "https://www.partyperfecteventrental.com",
] as const;

export function isAllowedApiCorsOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if ((API_CORS_ALLOW_ORIGINS as readonly string[]).includes(origin)) return true;
  if (process.env.NODE_ENV !== "production") {
    return (
      origin === "http://localhost:3000" ||
      origin === "http://127.0.0.1:3000" ||
      origin === "http://localhost:3001" ||
      origin === "http://127.0.0.1:3001"
    );
  }
  return false;
}

export function corsHeadersForOrigin(
  origin: string | null | undefined,
): Record<string, string> {
  if (!isAllowedApiCorsOrigin(origin)) {
    return { Vary: "Origin" };
  }
  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With, X-CSRF-Nonce",
    "Access-Control-Max-Age": "600",
  };
}
