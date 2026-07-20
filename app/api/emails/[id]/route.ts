import { updateEmailItem } from "@/lib/storage";
import type { EmailPriority, InboxEmailStatus } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      status?: InboxEmailStatus;
      priority?: EmailPriority;
    };

    if (!body.status && !body.priority) {
      return NextResponse.json(
        { error: "Provide status and/or priority to update." },
        { status: 400 },
      );
    }

    if (
      body.status &&
      body.status !== "read" &&
      body.status !== "unread" &&
      body.status !== "replied" &&
      body.status !== "archived"
    ) {
      return NextResponse.json(
        { error: "status must be read, unread, replied, or archived." },
        { status: 400 },
      );
    }

    if (
      body.priority &&
      body.priority !== "urgent" &&
      body.priority !== "business" &&
      body.priority !== "general" &&
      body.priority !== "low"
    ) {
      return NextResponse.json(
        { error: "priority must be urgent, business, general, or low." },
        { status: 400 },
      );
    }

    const email = await updateEmailItem(id, {
      status: body.status,
      priority: body.priority,
    });
    if (!email) {
      return NextResponse.json({ error: "Email not found." }, { status: 404 });
    }

    return NextResponse.json({ email });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { getEmail } = await import("@/lib/storage");
  const email = await getEmail(id);

  if (!email) {
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  }

  return NextResponse.json({ email });
}
