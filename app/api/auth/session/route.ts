import {
  buildSession,
  clearAuthFailures,
  clearSessionCookie,
  clientIp,
  enforceAuthRateLimit,
  isAuthError,
  readSession,
  registerAuthFailure,
  requireSession,
  setSessionCookie,
  verifyOwnerPin,
  verifyTeamPassword,
  OWNER_PIN_LENGTH,
} from "@/lib/server-auth";
import { recordAuthTelemetry } from "@/lib/sentinel-telemetry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET — current server session (cookie). */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    role: session.role,
    expiresAt: session.exp,
  });
}

/** POST — team password login OR owner PIN unlock. */
export async function POST(request: Request) {
  const ip = clientIp(request);

  let body: { password?: string; pin?: string; action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action || (body.pin ? "owner" : "login");

  if (action === "logout") {
    const existing = await readSession();
    void recordAuthTelemetry({
      kind: "AUTH_LOGOUT",
      outcome: "logout",
      role: existing?.role,
      ip,
      userAgent: request.headers.get("user-agent"),
      iat: existing?.iat,
      exp: existing?.exp,
    });
    const res = NextResponse.json({ ok: true });
    return clearSessionCookie(res);
  }

  if (action === "owner") {
    const gate = await requireSession();
    if (isAuthError(gate)) return gate;

    const locked = await enforceAuthRateLimit(ip, "owner");
    if (locked) {
      void recordAuthTelemetry({
        kind: "AUTH_LOCKOUT",
        outcome: "lockout",
        role: "owner",
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ error: locked }, { status: 429 });
    }

    const pin = String(body.pin || "");
    const pinDigits = pin.replace(/\D/g, "");
    if (pinDigits.length !== OWNER_PIN_LENGTH) {
      await registerAuthFailure(ip, "owner");
      return NextResponse.json(
        { error: `Admin code must be ${OWNER_PIN_LENGTH} digits.` },
        { status: 400 },
      );
    }
    if (!verifyOwnerPin(pin)) {
      await registerAuthFailure(ip, "owner");
      void recordAuthTelemetry({
        kind: "AUTH_OWNER_FAIL",
        outcome: "fail",
        role: "owner",
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ error: "Incorrect admin code." }, { status: 401 });
    }
    await clearAuthFailures(ip, "owner");
    const session = buildSession("owner");
    void recordAuthTelemetry({
      kind: "AUTH_OWNER_UNLOCK",
      outcome: "success",
      role: session.role,
      ip,
      userAgent: request.headers.get("user-agent"),
      iat: session.iat,
      exp: session.exp,
    });
    const res = NextResponse.json({
      ok: true,
      role: session.role,
      expiresAt: session.exp,
    });
    return setSessionCookie(res, session);
  }

  // Team login
  const locked = await enforceAuthRateLimit(ip, "login");
  if (locked) {
    void recordAuthTelemetry({
      kind: "AUTH_LOCKOUT",
      outcome: "lockout",
      role: "employee",
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ error: locked }, { status: 429 });
  }

  const password = String(body.password || "");
  if (!password.trim()) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }
  if (!verifyTeamPassword(password)) {
    await registerAuthFailure(ip, "login");
    void recordAuthTelemetry({
      kind: "AUTH_LOGIN_FAIL",
      outcome: "fail",
      role: "employee",
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  await clearAuthFailures(ip, "login");
  const session = buildSession("employee");
  void recordAuthTelemetry({
    kind: "AUTH_LOGIN",
    outcome: "success",
    role: session.role,
    ip,
    userAgent: request.headers.get("user-agent"),
    iat: session.iat,
    exp: session.exp,
  });
  const res = NextResponse.json({
    ok: true,
    role: session.role,
    expiresAt: session.exp,
  });
  return setSessionCookie(res, session);
}

/** DELETE — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
