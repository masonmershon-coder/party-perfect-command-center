/**
 * Safe session/auth telemetry for Sentinel Inbox.
 * Never stores password, full IP, full UA, email, or PIN.
 */

import { createHash } from "node:crypto";
import { appendSentinelAppEvent } from "./sentinel-inbox";
import type { SessionRole } from "./server-auth";

export function ipPrefix24(ip: string): string {
  const v = (ip || "").trim();
  if (!v || v === "unknown") return "unknown";
  if (v.includes(":")) {
    const parts = v.split(":");
    return `${parts.slice(0, 4).join(":")}:/64`;
  }
  const octets = v.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  return "unknown";
}

export function uaFamily(userAgent: string | null | undefined): string {
  const ua = userAgent || "";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (!ua.trim()) return "unknown";
  return "other";
}

export function sessionHash(input: {
  role?: SessionRole | string;
  iat?: number;
  exp?: number;
}): string {
  return createHash("sha256")
    .update(`${input.role || ""}:${input.iat || 0}:${input.exp || 0}`)
    .digest("hex")
    .slice(0, 12);
}

export async function recordAuthTelemetry(input: {
  kind:
    | "AUTH_LOGIN"
    | "AUTH_LOGIN_FAIL"
    | "AUTH_OWNER_UNLOCK"
    | "AUTH_OWNER_FAIL"
    | "AUTH_LOCKOUT"
    | "AUTH_LOGOUT";
  outcome: "success" | "fail" | "lockout" | "logout";
  role?: string;
  ip: string;
  userAgent?: string | null;
  iat?: number;
  exp?: number;
}): Promise<void> {
  try {
    await appendSentinelAppEvent({
      kind: input.kind,
      severity: input.outcome === "success" || input.outcome === "logout" ? "WATCH" : "HIGH",
      title: input.kind.replace(/_/g, " "),
      summary: `Auth ${input.outcome}`,
      outcome: input.outcome,
      role: input.role,
      ipPrefix: ipPrefix24(input.ip),
      uaFamily: uaFamily(input.userAgent),
      sessionHash: sessionHash({
        role: input.role,
        iat: input.iat,
        exp: input.exp,
      }),
    });
  } catch {
    // Telemetry must never block login.
  }
}

export async function recordInjectionSignals(input: {
  surface: string;
  signalCount: number;
  signalIds: string[];
  ip?: string;
  userAgent?: string | null;
}): Promise<void> {
  if (input.signalCount <= 0) return;
  try {
    await appendSentinelAppEvent({
      kind: "PROMPT_INJECTION_SUSPECTED",
      severity: "HIGH",
      title: "Prompt injection signals",
      summary: `${input.surface}: ${input.signalCount} signal(s)`,
      signalCount: input.signalCount,
      signalIds: input.signalIds,
      ipPrefix: input.ip ? ipPrefix24(input.ip) : undefined,
      uaFamily: uaFamily(input.userAgent),
    });
  } catch {
    // Fail open for business intake.
  }
}
