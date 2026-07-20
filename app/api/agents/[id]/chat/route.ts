import {
  appendMessages,
  getAgent,
  getConversation,
  replaceLastAssistantMessage,
  updateAgent,
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

function createMessage(
  role: Message["role"],
  content: string,
  taskId?: string,
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    taskId,
    createdAt: new Date().toISOString(),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const agent = await getAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const conversation = await getConversation(id);
  return NextResponse.json({ agent, conversation });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      message?: string;
      taskId?: string;
    };

    if (!body.message?.trim()) {
      return NextResponse.json(
        { error: "message is required." },
        { status: 400 },
      );
    }

    const agent = await getAgent(id);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const conversation = await getConversation(id);
    const userMessage = createMessage("user", body.message.trim(), body.taskId);
    const assistantMessage = createMessage("assistant", "", body.taskId);

    await appendMessages(id, [userMessage, assistantMessage]);
    await updateAgent(id, { status: "working" });

    const priorMessages = [
      ...conversation.messages,
      userMessage,
    ].map(({ role, content }) => ({ role, content }));

    const stream = await streamGrokResponse({
      model: agent.model,
      systemPrompt: buildAgentSystemPrompt(agent),
      messages: priorMessages,
    });

    const readable = createTextStream(stream);
    const reader = readable.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";

    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            assistantContent += decoder.decode(value, { stream: true });
            controller.enqueue(value);
          }

          await replaceLastAssistantMessage(
            id,
            assistantMessage.id,
            assistantContent,
          );
          await updateAgent(id, { status: "idle" });
          controller.close();
        } catch (error) {
          await replaceLastAssistantMessage(
            id,
            assistantMessage.id,
            assistantContent || "Sorry, I encountered an error.",
          );
          await updateAgent(id, { status: "error" });
          controller.error(error);
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Assistant-Message-Id": assistantMessage.id,
        "X-User-Message-Id": userMessage.id,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
