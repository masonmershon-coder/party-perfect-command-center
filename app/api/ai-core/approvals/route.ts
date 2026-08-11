import { isAiCoreConfigured, listApprovals } from "@/lib/ai-core";
import { allowedDomains, resolveAllowedDomain } from "@/lib/ai-core-auth";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/ai-core/approvals?persona=mike|matter[&status=PENDING] — approvals inbox for an allowed domain. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;
  if (!isAiCoreConfigured()) return NextResponse.json({ approvals: [], note: "AI Core not connected yet" });

  const url = new URL(request.url);
  const domain = resolveAllowedDomain(session.role, { persona: url.searchParams.get("persona") ?? undefined, domain: url.searchParams.get("domain") ?? undefined })
    ?? allowedDomains(session.role)[0];
  const status = (url.searchParams.get("status") as "PENDING" | "APPROVED" | "REJECTED") || "PENDING";

  try {
    const approvals = await listApprovals({ domain, status, limit: 50 });
    return NextResponse.json({ domain, approvals });
  } catch (err) {
    console.error("[ai-core/approvals GET]", err);
    return NextResponse.json({ error: "Could not load approvals" }, { status: 502 });
  }
}
