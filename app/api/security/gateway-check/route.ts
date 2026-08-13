import { isAuthError, requireApiAuth } from "@/lib/api-auth";
import { matterHttpGate, matterRoleForSession } from "@/lib/matter-http";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Owner probe of the Matter HTTP gate using the caller's mapped role.
 * Does not accept arbitrary Matter role impersonation.
 */
export async function POST(request: Request) {
  const gate = await requireApiAuth("security");
  if (isAuthError(gate)) return gate;

  let body: { resource?: string; action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const resource = String(body.resource || "").trim();
  const action = String(body.action || "read").trim() || "read";
  if (!resource) {
    return NextResponse.json(
      { error: "resource required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const decision = matterHttpGate({
    role: matterRoleForSession(gate.role),
    resource,
    action,
  });

  return NextResponse.json(
    {
      allowed: decision.allowed,
      decision: decision.decision,
    },
    { status: decision.allowed ? 200 : 403, headers: NO_STORE_HEADERS },
  );
}
