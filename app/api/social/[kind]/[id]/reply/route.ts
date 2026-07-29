import {
  formatMetaUserError,
  resolveMetaConfig,
  MetaGraphError,
  replyToFacebookComment,
  replyToInstagramComment,
} from "@/lib/meta-graph";
import { getSocialComment, updateSocialComment } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { kind, id } = await context.params;

  if (kind !== "comments") {
    return NextResponse.json(
      {
        error:
          "Only comment replies are supported via Meta Graph right now. DMs require additional messaging permissions.",
      },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message = body?.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Reply message is required." },
        { status: 400 },
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: "Reply is too long (max 2000 characters)." },
        { status: 400 },
      );
    }

    const comment = await getSocialComment(id);
    if (!comment) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const config = await resolveMetaConfig();
    if (!config) {
      return NextResponse.json(
        {
          error:
            "Meta is not connected. Open Social → Connect with Facebook first.",
          canSend: false,
        },
        { status: 503 },
      );
    }

    if (!comment.externalId || comment.source !== "meta") {
      // Demo / local-only comment — mark replied without Graph call
      const item = await updateSocialComment(id, { status: "replied" });
      return NextResponse.json({
        success: true,
        sentViaMeta: false,
        message:
          "Marked as replied locally (demo comment — not sent to Meta).",
        item,
      });
    }

    try {
      const result =
        comment.platform === "facebook"
          ? await replyToFacebookComment(config, comment.externalId, message)
          : await replyToInstagramComment(config, comment.externalId, message);

      const item = await updateSocialComment(id, { status: "replied" });

      return NextResponse.json({
        success: true,
        sentViaMeta: true,
        metaReplyId: result.id,
        message: `Reply posted to ${comment.platform}.`,
        item,
      });
    } catch (error) {
      const status =
        error instanceof MetaGraphError && error.isTokenInvalid ? 401 : 502;
      return NextResponse.json(
        {
          success: false,
          sentViaMeta: false,
          error: formatMetaUserError(error),
          isTokenInvalid:
            error instanceof MetaGraphError ? error.isTokenInvalid : false,
        },
        { status },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send social reply.",
      },
      { status: 500 },
    );
  }
}
