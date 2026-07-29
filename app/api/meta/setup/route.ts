import {
  publicMetaCredentialStatus,
  readMetaCredentials,
  writeMetaCredentials,
} from "@/lib/meta-credentials";
import { buildMetaOAuthUrl, getMetaRedirectUri } from "@/lib/meta-oauth";
import { resolveMetaConfig } from "@/lib/meta-graph";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const creds = await readMetaCredentials();
  const status = publicMetaCredentialStatus(creds);
  const live = Boolean(await resolveMetaConfig());
  const oauthUrl = await buildMetaOAuthUrl("facebook", request.url);

  return NextResponse.json({
    live,
    status,
    oauthUrl,
    redirectUri: getMetaRedirectUri(request.url),
    setupSteps: [
      "Create a free Meta app at developers.facebook.com (type: Business).",
      "Copy App ID + App Secret into this setup form and Save.",
      "Add the redirect URI shown below to the Meta app Valid OAuth Redirect URIs.",
      "Click Connect with Facebook, log in as the Page admin, and click Allow.",
      "Mike will pull Page token, Page ID, and Instagram automatically.",
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      appId?: string;
      appSecret?: string;
    } | null;

    const appId = body?.appId?.trim();
    const appSecret = body?.appSecret?.trim();

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "App ID and App Secret are required." },
        { status: 400 },
      );
    }

    if (!/^\d+$/.test(appId)) {
      return NextResponse.json(
        { error: "App ID should be numbers only (from Meta Developer dashboard)." },
        { status: 400 },
      );
    }

    await writeMetaCredentials({ appId, appSecret });
    const oauthUrl = await buildMetaOAuthUrl("facebook", request.url);

    return NextResponse.json({
      success: true,
      message: "App credentials saved. Click Connect with Facebook next.",
      oauthUrl,
      redirectUri: getMetaRedirectUri(request.url),
      status: publicMetaCredentialStatus(await readMetaCredentials()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save Meta setup.",
      },
      { status: 500 },
    );
  }
}
