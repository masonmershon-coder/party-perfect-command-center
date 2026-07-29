import { connectAccount } from "@/lib/connection-sessions";
import { completeMetaOAuth } from "@/lib/meta-oauth";
import { formatMetaUserError } from "@/lib/meta-graph";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Meta OAuth callback — exchanges code for Page + Instagram credentials.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error_description") || searchParams.get("error");

  const origin = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/?section=social&oauth_error=${encodeURIComponent(error)}`,
        origin,
      ),
    );
  }

  const platform =
    state === "facebook" || state === "instagram" ? state : "facebook";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/?section=social&oauth_error=${encodeURIComponent("Missing OAuth code from Meta.")}`,
        origin,
      ),
    );
  }

  try {
    const result = await completeMetaOAuth({
      code,
      requestUrl: request.url,
    });

    await connectAccount({
      type: "social",
      accountKey: "facebook",
      label: result.pageName || "Facebook",
    });

    if (result.instagramBusinessAccountId) {
      await connectAccount({
        type: "social",
        accountKey: "instagram",
        label: result.instagramUsername || "Instagram",
      });
    }

    const params = new URLSearchParams({
      section: "social",
      connected: platform,
      meta: "live",
    });
    if (result.instagramBusinessAccountId) {
      params.set("ig", "1");
    }

    return NextResponse.redirect(new URL(`/?${params.toString()}`, origin));
  } catch (err) {
    const message = formatMetaUserError(err);
    return NextResponse.redirect(
      new URL(
        `/?section=social&oauth_error=${encodeURIComponent(message)}`,
        origin,
      ),
    );
  }
}
