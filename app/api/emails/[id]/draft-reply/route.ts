import { MADISON_VOICE } from "@/lib/agent-voices";
import { getEmailAccount } from "@/lib/email-accounts";
import {
  assertGrokConfigured,
  createTextStream,
  grokClient,
} from "@/lib/grok";
import { getEmail } from "@/lib/storage";
import type { GrokModel } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DRAFT_MODEL: GrokModel = "grok-build-0.1";

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      instructions?: string;
      tone?: "professional" | "friendly" | "concise";
    };

    const email = await getEmail(id);
    if (!email) {
      return NextResponse.json({ error: "Email not found." }, { status: 404 });
    }

    const account = getEmailAccount(email.accountId);
    assertGrokConfigured();

    const useMadisonVoice =
      email.accountId === "michelle" || email.accountId === "company";
    const tone = body.tone ?? (useMadisonVoice ? "friendly" : "professional");
    const extraInstructions = body.instructions?.trim();

    const systemPrompt = [
      useMadisonVoice
        ? MADISON_VOICE
        : "You are an email assistant for Party Perfect Event Rentals in Tulsa, Oklahoma.",
      `Draft a ${tone} reply on behalf of ${account?.label ?? "the team"} (${account?.address ?? "Rentals@partyperfecteventrental.com"}).`,
      "Write only the email body — no subject line, no markdown headers.",
      "Be warm, clear, and action-oriented. Reference specific details from the incoming message.",
      "Sign off appropriately for Party Perfect Event Rentals.",
    ].join("\n");

    const userPrompt = [
      `Incoming email from ${email.sender} <${email.senderEmail}>`,
      `Subject: ${email.subject}`,
      "",
      email.body,
      extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : "",
    ].join("\n");

    const stream = await grokClient.responses.create({
      model: DRAFT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    });

    return new Response(createTextStream(stream), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to draft reply.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
