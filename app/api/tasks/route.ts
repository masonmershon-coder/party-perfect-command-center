import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { createTask, listTasks } from "@/lib/storage";
import type { CreateTaskInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireApiAuth("tasks");
  if (isAuthError(gate)) return gate;

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId") ?? undefined;
  const tasks = await listTasks(agentId);
  return privateJson({ tasks });
}

export async function POST(request: Request) {
  const gate = await requireApiAuth("tasks");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json()) as CreateTaskInput;

    if (!body.agentId || !body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: "agentId, title, and description are required." },
        { status: 400 },
      );
    }

    const task = await createTask(body);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
