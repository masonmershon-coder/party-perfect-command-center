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
    const res = NextResponse.json({ ok: true });
    return clearSessionCookie(res);
  }

  if (action === "owner") {
    const gate = await requireSession();
    if (isAuthError(gate)) return gate;

    const locked = await enforceAuthRateLimit(ip, "owner");
    if (locked) {
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
      return NextResponse.json({ error: "Incorrect admin code." }, { status: 401 });
    }
    await clearAuthFailures(ip, "owner");
    const session = buildSession("owner");
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
    return NextResponse.json({ error: locked }, { status: 429 });
  }

  const password = String(body.password || "");
  if (!password.trim()) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }
  if (!verifyTeamPassword(password)) {
    await registerAuthFailure(ip, "login");
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  await clearAuthFailures(ip, "login");
  const session = buildSession("employee");
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
