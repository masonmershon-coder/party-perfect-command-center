import { MADISON_VOICE } from "@/lib/agent-voices";
import { getSocialAccount } from "@/lib/social-accounts";
import { assertGrokConfigured, createTextStream, grokClient } from "@/lib/grok";
import { getSocialComment, getSocialMessage } from "@/lib/storage";
import type { GrokModel, SocialPlatform } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

const DRAFT_MODEL: GrokModel = "grok-build-0.1";

export async function POST(request: Request, context: RouteContext) {
  const { kind, id } = await context.params;

  try {
    const body = (await request.json()) as {
      instructions?: string;
      tone?: "professional" | "friendly" | "concise";
    };

    const tone = body.tone ?? "friendly";
    const extraInstructions = body.instructions?.trim();

    let platform: SocialPlatform = "instagram";
    let contextBlock = "";

    if (kind === "comments") {
      const comment = await getSocialComment(id);
      if (!comment) {
        return NextResponse.json({ error: "Comment not found." }, { status: 404 });
      }
      platform = comment.platform;
      contextBlock = [
        `Comment on ${comment.platform} from ${comment.author} (${comment.authorHandle})`,
        comment.text,
      ].join("\n");
    } else if (kind === "messages") {
      const message = await getSocialMessage(id);
      if (!message) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }
      platform = message.platform;
      contextBlock = [
        `Direct message on ${message.platform} from ${message.sender} (${message.senderHandle})`,
        message.body,
      ].join("\n");
    } else {
      return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
    }

    const account = getSocialAccount(platform);
    assertGrokConfigured();

    const systemPrompt = [
      MADISON_VOICE,
      `Draft a ${tone} public reply for ${account?.label ?? platform} (${account?.handle ?? "Party Perfect"}).`,
      kind === "messages"
        ? "This is a direct message reply — warm, helpful, and invite them to DM or call for quotes."
        : "This is a comment reply — concise, on-brand, celebratory, and professional.",
      "Write only the reply text — no quotes, labels, or markdown.",
      "Use teal-brand warmth; mention Tulsa/local when natural.",
    ].join("\n");

    const userPrompt = [
      contextBlock,
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
