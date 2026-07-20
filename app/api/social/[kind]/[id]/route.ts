import { updateSocialComment, updateSocialMessage } from "@/lib/storage";
import type { SocialInteractionStatus } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { kind, id } = await context.params;

  try {
    const body = (await request.json()) as { status?: SocialInteractionStatus };

    if (
      body.status !== "read" &&
      body.status !== "unread" &&
      body.status !== "replied" &&
      body.status !== "archived"
    ) {
      return NextResponse.json(
        { error: "status must be read, unread, replied, or archived." },
        { status: 400 },
      );
    }

    const item =
      kind === "comments"
        ? await updateSocialComment(id, { status: body.status })
        : kind === "messages"
          ? await updateSocialMessage(id, { status: body.status })
          : null;

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update social item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
