import OpenAI from "openai";
import { MIKE_VOICE } from "./agent-voices";
import {
  formatPorContextForAgents,
  getPorSnapshot,
  getPorSyncMeta,
} from "./por-snapshot";
import { MIKE_OPERATIONS_AGENT_ID } from "./seed";
import type { Agent, GrokModel, Message } from "./types";

export const grokClient = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
  timeout: 3600 * 1000,
});

export function assertGrokConfigured() {
  if (!process.env.XAI_API_KEY) {
    throw new Error("XAI_API_KEY is not configured. Add it to .env.local.");
  }
}

export async function buildAgentSystemPrompt(agent: Agent) {
  const lines = [
    `You are ${agent.name}, an autonomous company agent.`,
    `Your primary goal: ${agent.goal}`,
    "Respond clearly, take initiative, and report progress when working on tasks.",
    "When completing work, summarize outcomes and next steps.",
  ];

  if (agent.id === MIKE_OPERATIONS_AGENT_ID) {
    lines.push(MIKE_VOICE);
    const snapshot = await getPorSnapshot();
    const meta = getPorSyncMeta(snapshot);
    lines.push(formatPorContextForAgents(snapshot, meta));
    lines.push(
      "Answer availability / AR / today's deliveries from the POR snapshot when present. Never invent POR writes.",
    );
  }

  return lines.join("\n");
}

export function toGrokInput(messages: Pick<Message, "role" | "content">[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export async function streamGrokResponse(params: {
  model: GrokModel;
  systemPrompt: string;
  messages: Pick<Message, "role" | "content">[];
}) {
  assertGrokConfigured();

  return grokClient.responses.create({
    model: params.model,
    input: [
      { role: "system", content: params.systemPrompt },
      ...toGrokInput(params.messages),
    ],
    stream: true,
  });
}

export function createTextStream(
  stream: AsyncIterable<{ type: string; delta?: string }>,
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) {
            controller.enqueue(encoder.encode(event.delta));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
