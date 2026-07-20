import {
  appendMessages,
  getAgent,
  getTask,
  replaceLastAssistantMessage,
  updateAgent,
  updateTask,
} from "@/lib/storage";
import {
  buildAgentSystemPrompt,
  createTextStream,
  streamGrokResponse,
} from "@/lib/grok";
import type { Message } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function createMessage(role: Message["role"], content: string, taskId: string) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    taskId,
    createdAt: new Date().toISOString(),
  } satisfies Message;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id: taskId } = await context.params;

  try {
    const task = await getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const agent = await getAgent(task.agentId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    await updateTask(taskId, { status: "in_progress", progress: 10 });
    await updateAgent(agent.id, { status: "working" });

    const prompt = [
      `Execute this task: ${task.title}`,
      task.description,
      "Provide a clear execution plan, progress updates, and final deliverable.",
    ].join("\n\n");

    const userMessage = createMessage("user", prompt, taskId);
    const assistantMessage = createMessage("assistant", "", taskId);
    await appendMessages(agent.id, [userMessage, assistantMessage]);

    const stream = await streamGrokResponse({
      model: agent.model,
      systemPrompt: buildAgentSystemPrompt(agent),
      messages: [{ role: "user", content: prompt }],
    });

    const readable = createTextStream(stream);
    const reader = readable.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";

    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let progress = 10;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            assistantContent += decoder.decode(value, { stream: true });
            progress = Math.min(95, progress + 2);
            await updateTask(taskId, { progress });
            controller.enqueue(value);
          }

          await replaceLastAssistantMessage(
            agent.id,
            assistantMessage.id,
            assistantContent,
          );
          await updateTask(taskId, {
            status: "done",
            progress: 100,
            result: assistantContent,
          });
          await updateAgent(agent.id, { status: "completed" });
          controller.close();
        } catch (error) {
          await replaceLastAssistantMessage(
            agent.id,
            assistantMessage.id,
            assistantContent || "Task execution failed.",
          );
          await updateTask(taskId, {
            status: "done",
            progress: task.progress,
            result: assistantContent,
          });
          await updateAgent(agent.id, { status: "error" });
          controller.error(error);
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Task-Id": taskId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run task.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
