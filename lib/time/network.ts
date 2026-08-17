/**
 * Server-side client IP + Party Perfect office egress matching.
 * Never treat client-supplied GPS as IP, and never substitute IP for GPS.
 *
 * On Vercel, `x-forwarded-for` / `x-vercel-forwarded-for` are platform-set.
 * Elsewhere require TIME_TRUST_PROXY=1 before trusting forwarded headers.
 */

import type { NetworkClass } from "@/lib/time/types";

export function approvedOfficeEgressIps(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.TIME_OFFICE_EGRESS_IPS || "").trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function trustProxyHeaders(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL === "1" || env.VERCEL === "true") return true;
  return env.TIME_TRUST_PROXY === "1" || env.TIME_TRUST_PROXY === "true";
}

/** Leftmost / first client address from a forwarded-for chain. */
export function firstForwardedIp(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  if (!first || first === "unknown") return null;
  return first;
}

export function trustedClientIp(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): { ip: string | null; networkClass: NetworkClass; officeNetworkMatch: boolean | null } {
  let ip: string | null = null;
  if (trustProxyHeaders(env)) {
    ip =
      firstForwardedIp(request.headers.get("x-vercel-forwarded-for")) ||
      firstForwardedIp(request.headers.get("x-forwarded-for")) ||
      request.headers.get("x-real-ip")?.trim() ||
      null;
  }

  if (!ip) {
    return { ip: null, networkClass: "UNKNOWN", officeNetworkMatch: null };
  }

  const approved = approvedOfficeEgressIps(env);
  if (approved.length === 0) {
    return { ip, networkClass: "OTHER_NETWORK", officeNetworkMatch: null };
  }
  const match = approved.includes(ip);
  return {
    ip,
    networkClass: match ? "PARTY_PERFECT_NETWORK" : "OTHER_NETWORK",
    officeNetworkMatch: match,
  };
}
