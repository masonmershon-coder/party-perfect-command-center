import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/no-store";

export const KITUWA_COOKIE = "kituwa_session";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type KituwaSession = {
  sub: "mason";
  caps: Array<"view" | "task_create">;
  iat: number;
  exp: number;
  v: 1;
};

function secret(): string {
  const a = process.env.KITUWA_SESSION_SECRET?.trim();
  if (a && a.length >= 16) return a;
  const b = process.env.SESSION_SECRET?.trim();
  if (b && b.length >= 16) return `kituwa:${b}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("KITUWA_SESSION_SECRET is required in production");
  }
  return "kituwa-dev-only-secret";
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
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest());
}

export function encodeKituwaSession(session: KituwaSession): string {
  const payloadB64 = b64url(JSON.stringify(session));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeKituwaSession(token: string | undefined | null): KituwaSession | null {
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
    const parsed = JSON.parse(fromB64url(payloadB64).toString("utf8")) as KituwaSession;
    if (parsed?.v !== 1 || parsed.sub !== "mason" || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildKituwaSession(): KituwaSession {
  const now = Date.now();
  return {
    sub: "mason",
    caps: ["view", "task_create"],
    iat: now,
    exp: now + TTL_MS,
    v: 1,
  };
}

export function kituwaOwnerPinConfigured(): boolean {
  return Boolean((process.env.KITUWA_OWNER_PIN || process.env.OWNER_PIN || "").trim());
}

export function verifyKituwaPin(presented: string): boolean {
  const expected = (process.env.KITUWA_OWNER_PIN || process.env.OWNER_PIN || "").trim();
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function setKituwaCookie(res: NextResponse, session: KituwaSession): NextResponse {
  res.cookies.set(KITUWA_COOKIE, encodeKituwaSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.exp),
  });
  return res;
}

export function clearKituwaCookie(res: NextResponse): NextResponse {
  res.cookies.set(KITUWA_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return res;
}

export function kituwaSessionFromRequest(request: Request): KituwaSession | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${KITUWA_COOKIE}=([^;]+)`));
  return decodeKituwaSession(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export function kituwaPrivateJson(data: unknown, init?: { status?: number; clear?: boolean }) {
  const res = NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: NO_STORE_HEADERS,
  });
  if (init?.clear) clearKituwaCookie(res);
  return res;
}

export function requireKituwaSession(request: Request) {
  const session = kituwaSessionFromRequest(request);
  if (!session) {
    return kituwaPrivateJson({ error: "Unauthorized" }, { status: 401, clear: true });
  }
  return session;
}

export function isKituwaAuthError(v: KituwaSession | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export function verifyKituwaWorkerBearer(request: Request): boolean {
  const expected = (process.env.KITUWA_WORKER_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
