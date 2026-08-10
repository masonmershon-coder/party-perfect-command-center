import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Server-side session auth for Command Center.
 * Secrets live in env only — never ship passwords/PINs in the client bundle.
 *
 * Required (rotate from the old client-side codes — treat those as compromised):
 *   AUTH_PASSWORD — team login
 *   OWNER_PIN — 4+ digit owner unlock
 *   SESSION_SECRET — HMAC key for signing cookies (long random string)
 *
 * Until env is set in Vercel, temporary fallbacks keep local/dev usable but
 * MUST be rotated before real customers/money.
 */

const COOKIE_NAME = "pp_cc_session";
const MAIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OWNER_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionRole = "employee" | "owner";

export type AuthSession = {
  role: SessionRole;
  exp: number;
  iat: number;
  v: 1;
};

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // Derive a stable-but-weak secret so signed cookies work in local/dev.
  // Production MUST set SESSION_SECRET.
  return `pp-dev-only:${process.env.AUTH_PASSWORD || "unset"}`;
}

function teamPassword(): string {
  const fromEnv = process.env.AUTH_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_PASSWORD env is required in production");
  }
  // Local/dev only — rotate via AUTH_PASSWORD before shipping real customers.
  return "socialbutterfly";
}

function ownerPin(): string {
  const fromEnv = process.env.OWNER_PIN?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("OWNER_PIN env is required in production");
  }
  return "0623";
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string): string {
  return b64url(
    createHmac("sha256", sessionSecret()).update(payloadB64).digest(),
  );
}

function encodeSession(session: AuthSession): string {
  const payloadB64 = b64url(JSON.stringify(session));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decodeSession(token: string | undefined | null): AuthSession | null {
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
    const parsed = JSON.parse(fromB64url(payloadB64).toString("utf8")) as AuthSession;
    if (parsed?.v !== 1 || !parsed.exp || !parsed.role) return null;
    if (Date.now() > parsed.exp) return null;
    if (parsed.role !== "employee" && parsed.role !== "owner") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeEqualStr(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) {
    // Still compare to reduce timing leak on length.
    timingSafeEqual(aa, aa);
    return false;
  }
  return timingSafeEqual(aa, bb);
}

export function verifyTeamPassword(password: string): boolean {
  return safeEqualStr(password.trim(), teamPassword());
}

export function verifyOwnerPin(pin: string): boolean {
  const normalized = pin.replace(/\D/g, "");
  return safeEqualStr(normalized, ownerPin().replace(/\D/g, ""));
}

export function buildSession(role: SessionRole): AuthSession {
  const now = Date.now();
  const ttl = role === "owner" ? OWNER_TTL_MS : MAIN_TTL_MS;
  return { v: 1, role, iat: now, exp: now + ttl };
}

export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export async function readSession(): Promise<AuthSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE_NAME)?.value);
}

export async function requireSession(): Promise<AuthSession | NextResponse> {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireOwner(): Promise<AuthSession | NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  return session;
}

export function isAuthError(
  value: AuthSession | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}

export function setSessionCookie(
  response: NextResponse,
  session: AuthSession,
): NextResponse {
  const maxAgeMs = Math.max(0, session.exp - Date.now());
  response.cookies.set(
    COOKIE_NAME,
    encodeSession(session),
    sessionCookieOptions(maxAgeMs || MAIN_TTL_MS),
  );
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

/** Simple per-IP login throttle (in-memory; use Upstash in multi-instance later). */
const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();

export function checkLoginRateLimit(ip: string): string | null {
  const row = loginAttempts.get(ip);
  if (!row) return null;
  if (row.lockedUntil > Date.now()) {
    const minutes = Math.ceil((row.lockedUntil - Date.now()) / 60_000);
    return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return null;
}

export function registerLoginFailure(ip: string) {
  const row = loginAttempts.get(ip) || { failures: 0, lockedUntil: 0 };
  row.failures += 1;
  if (row.failures >= 5) {
    row.failures = 0;
    row.lockedUntil = Date.now() + 5 * 60 * 1000;
  }
  loginAttempts.set(ip, row);
}

export function clearLoginFailures(ip: string) {
  loginAttempts.delete(ip);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function newCsrfNonce(): string {
  return randomBytes(16).toString("hex");
}
