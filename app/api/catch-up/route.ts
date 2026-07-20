import {
  buildCatchUpPrompt,
  fallbackCatchUpSummary,
  gatherCatchUpItems,
} from "@/lib/catch-up";
import { assertGrokConfigured, grokClient } from "@/lib/grok";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const items = await gatherCatchUpItems();
  const { emailCount, socialCount, totalCount } = buildCatchUpPrompt(items);

  return NextResponse.json({
    totalCount,
    emailCount,
    socialCount,
    items,
    lookbackMonths: 6,
  });
}

export async function POST() {
  try {
    const items = await gatherCatchUpItems();
    const prompt = buildCatchUpPrompt(items);
    const { emailCount, socialCount, totalCount } = prompt;

    let grokInsights = fallbackCatchUpSummary(
      totalCount,
      emailCount,
      socialCount,
    );

    if (totalCount > 0) {
      try {
        assertGrokConfigured();
        const response = await grokClient.responses.create({
          model: "grok-build-0.1",
          input: [
            {
              role: "system",
              content: [
                "You are the operations assistant for Party Perfect Event Rentals in Tulsa, Oklahoma.",
                "Analyze unreplied emails and social comments. Be concise and actionable.",
                "Start with one sentence: 'You have N outstanding items' using the exact count provided.",
                "Then 2-4 short bullet points naming the most important items to handle first and why.",
                "Focus on quotes, bookings, weddings, corporate events, and urgent client requests.",
                "Do not invent items not in the list.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify(prompt, null, 2),
            },
          ],
          stream: false,
        });

        const text =
          typeof response.output_text === "string"
            ? response.output_text
            : null;

        if (text?.trim()) {
          grokInsights = text.trim();
        }
      } catch {
        // fallback summary already set
      }
    }

    const rankedItems = items.slice(0, 15).map((item, index) => ({
      ...item,
      grokNote:
        index < 3 && item.priority === "high"
          ? "High priority — respond soon"
          : undefined,
    }));

    return NextResponse.json({
      totalCount,
      emailCount,
      socialCount,
      summary: `You have ${totalCount} outstanding item${totalCount === 1 ? "" : "s"}`,
      grokInsights,
      items: rankedItems,
      lookbackMonths: 6,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Catch up analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
