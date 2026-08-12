import {
  isAuthError,
  requireSession,
} from "@/lib/server-auth";
import {
  appendMessages,
  getAgent,
  getConversation,
  replaceLastAssistantMessage,
  updateAgent,
} from "@/lib/storage";
import {
  buildAgentSystemPrompt,
  buildPorCrmContextForAgent,
  createTextStream,
  resolveChatModel,
  streamGrokResponse,
} from "@/lib/grok";
import { MIKE_OPERATIONS_AGENT_ID, MADISON_COMMS_AGENT_ID } from "@/lib/seed";
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
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const { id } = await context.params;
  const agent = await getAgent(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const conversation = await getConversation(id, gate.role);
  return NextResponse.json({ agent, conversation });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      message?: string;
      taskId?: string;
      financialAccess?: boolean;
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

    const conversationRole = gate.role;
    const conversation = await getConversation(id, conversationRole);
    const userMessage = createMessage("user", body.message.trim(), body.taskId);
    const assistantMessage = createMessage("assistant", "", body.taskId);

    try {
      await appendMessages(id, [userMessage, assistantMessage], conversationRole);
    } catch (persistError) {
      console.warn(
        "[agent-chat] appendMessages failed; continuing stream:",
        persistError instanceof Error ? persistError.message : persistError,
      );
    }
    try {
      await updateAgent(id, { status: "working" });
    } catch {
      // ignore
    }

    const priorMessages = [...conversation.messages, userMessage]
      .slice(-30)
      .map(({ role, content }) => ({ role, content }));

    const chatModel = resolveChatModel(
      id === MIKE_OPERATIONS_AGENT_ID || id === MADISON_COMMS_AGENT_ID
        ? undefined
        : agent.model,
    );

    if (chatModel !== agent.model) {
      try {
        await updateAgent(id, { model: chatModel });
      } catch {
        // ignore
      }
    }

    const financialAccess = conversationRole === "owner";

    const porCrmContext = await buildPorCrmContextForAgent(
      id,
      body.message.trim(),
      financialAccess,
    );

    const stream = await streamGrokResponse({
      model: chatModel,
      systemPrompt: await buildAgentSystemPrompt(agent, {
        financialAccess,
        porCrmContext,
      }),
      messages: priorMessages,
    });

    const readable = createTextStream(stream);
    const reader = readable.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";

    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            assistantContent += decoder.decode(value, { stream: true });
            controller.enqueue(value);
          }

          try {
            await replaceLastAssistantMessage(
              id,
              assistantMessage.id,
              assistantContent,
              conversationRole,
            );
          } catch {
            // ignore
          }
          try {
            await updateAgent(id, { status: "idle" });
          } catch {
            // ignore
          }
          controller.close();
        } catch (error) {
          try {
            await replaceLastAssistantMessage(
              id,
              assistantMessage.id,
              assistantContent || "Sorry, I encountered an error.",
              conversationRole,
            );
          } catch {
            // ignore
          }
          try {
            await updateAgent(id, { status: "error" });
          } catch {
            // ignore
          }
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
    console.error("[agent-chat]", error);
    return NextResponse.json(
      { error: "Failed to send message. Try again." },
      { status: 502 },
    );
  }
}
