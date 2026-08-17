import { NextResponse } from "next/server";
import {
  buildKituwaSession,
  isKituwaAuthError,
  kituwaOwnerPinConfigured,
  kituwaPrivateJson,
  requireKituwaSession,
  setKituwaCookie,
  verifyKituwaPin,
  clearKituwaCookie,
} from "@/lib/kituwa/auth";
import { NO_STORE_HEADERS } from "@/lib/no-store";

export async function GET(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  return kituwaPrivateJson({ ok: true, sub: gate.sub, caps: gate.caps });
}

export async function POST(request: Request) {
  let body: { pin?: string; action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.action === "signout") {
    const res = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
    clearKituwaCookie(res);
    return res;
  }
  if (!kituwaOwnerPinConfigured()) {
    return kituwaPrivateJson(
      { error: "Kituwa PIN is not configured (KITUWA_OWNER_PIN)." },
      { status: 503 },
    );
  }
  if (!verifyKituwaPin(String(body.pin || ""))) {
    return kituwaPrivateJson({ error: "Unauthorized" }, { status: 401 });
  }
  const session = buildKituwaSession();
  const res = NextResponse.json(
    { ok: true, sub: session.sub, caps: session.caps },
    { headers: NO_STORE_HEADERS },
  );
  setKituwaCookie(res, session);
  return res;
}
