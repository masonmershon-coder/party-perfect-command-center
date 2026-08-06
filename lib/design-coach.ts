import { MADISON_VOICE } from "@/lib/agent-voices";
import { assertGrokConfigured, grokClient } from "@/lib/grok";
import { MADISON_DESIGN_PLAYBOOK } from "@/lib/madison-design-playbook";
import { PARTY_PERFECT_COMPANY_KNOWLEDGE } from "@/lib/party-perfect-company";
import { MADISON_SOCIAL_PLAYBOOK } from "@/lib/madison-social-playbook";
import { listDesignAssets } from "@/lib/design-studio";

const COACH_SYSTEM = [
  MADISON_VOICE,
  PARTY_PERFECT_COMPANY_KNOWLEDGE,
  MADISON_DESIGN_PLAYBOOK,
  MADISON_SOCIAL_PLAYBOOK,
  "",
  "# Design Studio coach mode",
  "You are chatting inside Design Studio with showroom/décor staff.",
  "Help with PHOTO and VIDEO creative work like a top creative director + AI prompt engineer.",
  "",
  "For photos you can see:",
  "- Grade lighting, framing, wrinkles, color, client-readiness (1–10)",
  "- Say exactly how to reshoot on a phone in 3 steps",
  "- Write a ready-to-paste Grok Imagine prompt (mark it with Prompt: …)",
  "- Suggest whether to Generate new or Restyle from this photo",
  "",
  "For videos (or when only a video file is attached):",
  "- Give a shot list (angles, duration, moves)",
  "- Caption / Reel hook ideas for FB/IG",
  "- Still-frame moments to photograph for Imagine",
  "- Keep advice phone-filming friendly (no cinema gear required)",
  "",
  "Keep replies short enough for a busy showroom phone screen.",
  "Always stay Party Perfect Tulsa / Social Butterfly on-brand.",
].join("\n");

export type DesignCoachTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" } };

/**
 * Stream Madison (Grok) coaching via chat.completions (vision-friendly).
 */
export async function streamDesignCoach(input: {
  message: string;
  assetId?: string;
  history?: DesignCoachTurn[];
}): Promise<ReadableStream<Uint8Array>> {
  assertGrokConfigured();

  const message = input.message.trim();
  if (!message) throw new Error("Type a message for Madison.");

  let imageUrl: string | undefined;
  let assetNote = "";

  if (input.assetId?.trim()) {
    const assets = await listDesignAssets();
    const asset = assets.find((a) => a.id === input.assetId);
    if (asset) {
      if (asset.mimeType.startsWith("image/")) {
        imageUrl = asset.url;
        assetNote = `Attached studio photo: ${asset.fileName} (${asset.kind}).`;
      } else if (asset.mimeType.startsWith("video/")) {
        assetNote = [
          `Attached studio VIDEO (cannot scrub frames yet): ${asset.fileName}.`,
          "Coach filming, shot list, captions, and which stills to pull for Imagine.",
          asset.url.startsWith("http") ? `Video URL: ${asset.url}` : "",
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
  }

  const history = (input.history || []).slice(-10);
  const userText = [assetNote, message].filter(Boolean).join("\n\n");

  const userContent: ChatContent[] = [{ type: "text", text: userText }];
  if (imageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: imageUrl, detail: "high" },
    });
  }

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | ChatContent[];
  }> = [
    { role: "system", content: COACH_SYSTEM },
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user", content: userContent },
  ];

  try {
    const stream = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: messages as never,
      stream: true,
    });

    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  } catch (firstError) {
    if (!imageUrl) throw firstError;

    const stream = await grokClient.chat.completions.create({
      model: "grok-4.3",
      messages: [
        { role: "system", content: COACH_SYSTEM },
        ...history.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        {
          role: "user",
          content: `${userText}\n\n(Vision unavailable on retry — coach from description.)`,
        },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
}
