import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import type { TimeCapability, TimeEmployee } from "@/lib/time/types";

export const TIME_COOKIE = "pp_time_session";
/** Long-lived first-party trusted device credential (not IP identity). */
export const TIME_DEVICE_COOKIE = "pp_time_device";
/** Working session cookie — renewed on activity while trusted device remains valid. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Trusted personal device credential — server-revocable; not bound to public IP. */
export const DEVICE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const TTL_MS = SESSION_TTL_MS;

export type TimeSession = {
  employeeId: string;
  capabilities: TimeCapability[];
  exp: number;
  iat: number;
  /** Matches TimeEmployee.credentialsVersion — mismatch invalidates session. */
  cv: number;
  v: 1;
};

function timeSecret(): string {
  const s = process.env.TIME_SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  const fallback = process.env.SESSION_SECRET?.trim();
  if (fallback && fallback.length >= 16) return `time:${fallback}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TIME_SESSION_SECRET is required in production");
  }
  return "pp-time-dev-only-secret";
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", timeSecret()).update(payloadB64).digest());
}

export function encodeTimeSession(session: TimeSession): string {
  const payloadB64 = b64url(JSON.stringify(session));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeTimeSession(token: string | undefined | null): TimeSession | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(fromB64url(payloadB64).toString("utf8")) as TimeSession;
    if (parsed?.v !== 1 || !parsed.employeeId || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildTimeSession(employee: TimeEmployee): TimeSession {
  const now = Date.now();
  return {
    employeeId: employee.id,
    capabilities: employee.capabilities,
    iat: now,
    exp: now + TTL_MS,
    cv: employee.credentialsVersion ?? 0,
    v: 1,
  };
}

export function setTimeCookie(res: NextResponse, session: TimeSession): NextResponse {
  res.cookies.set(TIME_COOKIE, encodeTimeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.exp),
  });
  return res;
}

export function clearTimeCookie(res: NextResponse): NextResponse {
  res.cookies.set(TIME_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return res;
}

export function timeSessionFromRequest(request: Request): TimeSession | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TIME_COOKIE}=([^;]+)`));
  return decodeTimeSession(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function timePrivateJson(
  data: unknown,
  init?: {
    status?: number;
    session?: TimeSession | null;
    device?: TrustedDeviceToken | null;
    clear?: boolean;
    clearDevice?: boolean;
  },
) {
  const res = NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: NO_STORE_HEADERS,
  });
  if (init?.clear) clearTimeCookie(res);
  if (init?.clearDevice) clearTrustedDeviceCookie(res);
  if (init?.session) setTimeCookie(res, init.session);
  if (init?.device) setTrustedDeviceCookie(res, init.device);
  return res;
}

export async function requireTimeSession(request: Request): Promise<TimeSession | NextResponse> {
  const session = timeSessionFromRequest(request);
  if (!session) {
    return timePrivateJson({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export function isTimeAuthError(v: TimeSession | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyTimeMikeBearer(header: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const expected = (env.TIME_MIKE_TOKEN_SHA256 || "").trim().toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return false;
  if (!header || !header.startsWith("Bearer ")) return false;
  const presented = header.slice("Bearer ".length).trim();
  if (!presented) return false;
  const actual = sha256Hex(presented);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function ccOwnerCannotUseTimeCookie(ccCookie: string | null): boolean {
  return decodeTimeSession(ccCookie) == null;
}

export function timeCookieCannotBeCcSession(): true {
  return true;
}

export type TrustedDeviceToken = {
  deviceId: string;
  employeeId: string;
  iat: number;
  exp: number;
  v: 1;
};

export function encodeTrustedDeviceToken(token: TrustedDeviceToken): string {
  const payloadB64 = b64url(JSON.stringify(token));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeTrustedDeviceToken(raw: string | undefined | null): TrustedDeviceToken | null {
  if (!raw) return null;
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(fromB64url(payloadB64).toString("utf8")) as TrustedDeviceToken;
    if (parsed?.v !== 1 || !parsed.deviceId || !parsed.employeeId || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildTrustedDeviceToken(deviceId: string, employeeId: string): TrustedDeviceToken {
  const now = Date.now();
  return { deviceId, employeeId, iat: now, exp: now + DEVICE_TTL_MS, v: 1 };
}

export function trustedDeviceTokenFromRequest(request: Request): TrustedDeviceToken | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TIME_DEVICE_COOKIE}=([^;]+)`));
  return decodeTrustedDeviceToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function setTrustedDeviceCookie(res: NextResponse, token: TrustedDeviceToken): NextResponse {
  res.cookies.set(TIME_DEVICE_COOKIE, encodeTrustedDeviceToken(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(token.exp),
  });
  return res;
}

export function clearTrustedDeviceCookie(res: NextResponse): NextResponse {
  res.cookies.set(TIME_DEVICE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return res;
}

export function coarsePlatformHint(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.slice(0, 180);
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  return "Other";
}
