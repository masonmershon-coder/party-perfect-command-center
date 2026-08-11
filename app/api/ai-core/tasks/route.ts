import { createTask, isAiCoreConfigured, listTasks, type TaskStatus } from "@/lib/ai-core";
import { actorForRole, resolveAllowedDomain, allowedDomains } from "@/lib/ai-core-auth";
import { isAuthError, requireSession } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ai-core/tasks  — create a task (the phone control loop).
 * body: { persona?: "mike"|"matter", domain?: string, title, intent?, type?, source?, suggestedExecutor? }
 * Domain is SERVER-DERIVED from the session role — client input is validated, never trusted.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;
  if (!isAiCoreConfigured()) return NextResponse.json({ error: "AI Core not connected yet (DATABASE_URL unset)" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const domain = resolveAllowedDomain(session.role, { persona: body.persona as string, domain: body.domain as string });
  if (!domain) return NextResponse.json({ error: "Not authorized for that persona/domain" }, { status: 403 });

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const { id } = await createTask({
      domain,
      title,
      intent: typeof body.intent === "string" ? body.intent : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      source: typeof body.source === "string" ? body.source : "text",
      suggestedExecutor: typeof body.suggestedExecutor === "string" ? body.suggestedExecutor : undefined,
      createdBy: actorForRole(session.role),
    });
    return NextResponse.json({ id, domain, status: "NEW" });
  } catch (err) {
    console.error("[ai-core/tasks POST]", err);
    return NextResponse.json({ error: "Could not create task" }, { status: 502 });
  }
}

/** GET /api/ai-core/tasks?persona=mike|matter[&status=] — list tasks in an allowed domain. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isAuthError(session)) return session;
  if (!isAiCoreConfigured()) return NextResponse.json({ tasks: [], note: "AI Core not connected yet" });

  const url = new URL(request.url);
  const domain = resolveAllowedDomain(session.role, { persona: url.searchParams.get("persona") ?? undefined, domain: url.searchParams.get("domain") ?? undefined })
    ?? allowedDomains(session.role)[0];
  const status = (url.searchParams.get("status") as TaskStatus) || undefined;

  try {
    const tasks = await listTasks({ domain, status, limit: 30 });
    return NextResponse.json({ domain, tasks });
  } catch (err) {
    console.error("[ai-core/tasks GET]", err);
    return NextResponse.json({ error: "Could not load tasks" }, { status: 502 });
  }
}
