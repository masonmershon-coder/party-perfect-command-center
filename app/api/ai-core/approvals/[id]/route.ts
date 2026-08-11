import { decideApproval, getApprovalDomain, isAiCoreConfigured } from "@/lib/ai-core";
import { actorForRole, allowedDomains } from "@/lib/ai-core-auth";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ai-core/approvals/[id]  — approve or reject.
 * body: { decision: "APPROVED"|"REJECTED", note? }
 * P2A: state-only. No external side effects. Domain of the approval is validated
 * against the session's allowed domains (server-derived).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isAuthError(session)) return session;
  if (!isAiCoreConfigured()) return NextResponse.json({ error: "AI Core not connected yet" }, { status: 503 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const decision = body.decision === "APPROVED" || body.decision === "REJECTED" ? body.decision : null;
  if (!decision) return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });

  try {
    const domain = await getApprovalDomain(id);
    if (!domain) return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    if (!allowedDomains(session.role).includes(domain)) {
      return NextResponse.json({ error: "Not authorized for this approval's domain" }, { status: 403 });
    }
    await decideApproval(id, decision, actorForRole(session.role), typeof body.note === "string" ? body.note : undefined);
    return NextResponse.json({ id, status: decision });
  } catch (err) {
    console.error("[ai-core/approvals decide]", err);
    return NextResponse.json({ error: "Could not update approval" }, { status: 502 });
  }
}
