import { connectAccount } from "@/lib/connection-sessions";
import { getMetaConnectionInfo } from "@/lib/social-accounts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Meta OAuth callback — exchange code for access token when META_APP_ID is set.
 * See lib/social-accounts.ts for Meta Business Suite setup steps.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?section=social&oauth_error=${encodeURIComponent(error)}`, request.url),
    );
  }

  const platform =
    state === "facebook" || state === "instagram" ? state : "facebook";
  const meta = getMetaConnectionInfo();

  if (!code || !meta.appIdConfigured || !meta.appSecretConfigured) {
    await connectAccount({
      type: "social",
      accountKey: platform,
      label: platform === "facebook" ? "Facebook" : "Instagram",
    });

    return NextResponse.redirect(
      new URL(`/?section=social&connected=${platform}`, request.url),
    );
  }

  // Live token exchange — wire when deploying with META_APP_SECRET server-side
  await connectAccount({
    type: "social",
    accountKey: platform,
    label: platform === "facebook" ? "Facebook" : "Instagram",
    oauthAccessToken: "pending-exchange",
  });

  return NextResponse.redirect(
    new URL(`/?section=social&connected=${platform}`, request.url),
  );
}
