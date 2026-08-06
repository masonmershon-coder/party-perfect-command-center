import { streamDesignCoach } from "@/lib/design-coach";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      message?: string;
      assetId?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    } | null;

    const message = body?.message?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "message is required." },
        { status: 400 },
      );
    }

    const stream = await streamDesignCoach({
      message,
      assetId: body?.assetId,
      history: body?.history,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Madison coach failed.";
    const status = message.includes("XAI_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
