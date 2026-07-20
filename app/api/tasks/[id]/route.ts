import { getTask, updateTask } from "@/lib/storage";
import type { TaskStatus } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      status?: TaskStatus;
      progress?: number;
      result?: string;
    };

    const task = await updateTask(id, body);

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const task = await getTask(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await updateTask(id, { status: "done", progress: task.progress });
  return NextResponse.json({ success: true });
}
