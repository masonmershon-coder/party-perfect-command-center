import {
  publicGoogleAdsStatus,
  readGoogleAdsCredentials,
  writeGoogleAdsCredentials,
} from "@/lib/google-ads-credentials";
import {
  buildGoogleAdsOAuthUrl,
  getGoogleAdsRedirectUri,
  readGoogleAdsSnapshot,
  syncGoogleAdsSnapshot,
} from "@/lib/google-ads";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const creds = await readGoogleAdsCredentials();
  const status = publicGoogleAdsStatus(creds);
  const oauthUrl = await buildGoogleAdsOAuthUrl(request.url);
  const snapshot = await readGoogleAdsSnapshot();

  return NextResponse.json({
    status,
    oauthUrl,
    redirectUri: getGoogleAdsRedirectUri(request.url),
    snapshot,
    setupSteps: [
      "Create a Google Cloud project → OAuth Client (Web) with redirect URI below.",
      "In Google Ads → Tools → API Center, apply for a developer token (can take time).",
      "Paste Client ID, Client Secret, Developer Token, Customer ID (xxx-xxx-xxxx) + monthly budget.",
      "Click Connect with Google and sign in as Partyperfectok@gmail.com.",
      "Never paste a Google password into Command Center — OAuth only.",
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      accountEmail?: string;
      clientId?: string;
      clientSecret?: string;
      developerToken?: string;
      customerId?: string;
      loginCustomerId?: string;
      monthlyBudgetUsd?: number | string;
      notes?: string;
      password?: string;
    } | null;

    if (body?.password) {
      return NextResponse.json(
        {
          error:
            "Do not send Google passwords. Save OAuth Client ID/Secret and Connect with Google instead.",
        },
        { status: 400 },
      );
    }

    if (body?.action === "sync") {
      try {
        const snapshot = await syncGoogleAdsSnapshot();
        return NextResponse.json({
          success: true,
          message: "Google Ads snapshot refreshed.",
          snapshot,
          status: publicGoogleAdsStatus(await readGoogleAdsCredentials()),
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Google Ads sync failed.",
          },
          { status: 400 },
        );
      }
    }

    const monthly =
      body?.monthlyBudgetUsd === undefined || body?.monthlyBudgetUsd === ""
        ? undefined
        : Number(body.monthlyBudgetUsd);

    // Only patch fields the client actually sent so empty saves don't wipe OAuth secrets.
    const patch: Record<string, unknown> = {
      accountEmail:
        body?.accountEmail?.trim() || "Partyperfectok@gmail.com",
    };
    if (typeof body?.clientId === "string" && body.clientId.trim()) {
      patch.clientId = body.clientId.trim();
    }
    if (typeof body?.clientSecret === "string" && body.clientSecret.trim()) {
      patch.clientSecret = body.clientSecret.trim();
    }
    if (typeof body?.developerToken === "string" && body.developerToken.trim()) {
      patch.developerToken = body.developerToken.trim();
    }
    if (typeof body?.customerId === "string" && body.customerId.trim()) {
      patch.customerId = body.customerId.replace(/\D/g, "");
    }
    if (typeof body?.loginCustomerId === "string" && body.loginCustomerId.trim()) {
      patch.loginCustomerId = body.loginCustomerId.replace(/\D/g, "");
    }
    if (monthly != null && Number.isFinite(monthly)) {
      patch.monthlyBudgetUsd = monthly;
    }
    if (typeof body?.notes === "string") {
      patch.notes = body.notes.trim() || undefined;
    }
    await writeGoogleAdsCredentials(patch);

    const oauthUrl = await buildGoogleAdsOAuthUrl(request.url);
    return NextResponse.json({
      success: true,
      message:
        "Google Ads settings saved. Connect with Google (no password in app) next.",
      oauthUrl,
      redirectUri: getGoogleAdsRedirectUri(request.url),
      status: publicGoogleAdsStatus(await readGoogleAdsCredentials()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save Google Ads setup.",
      },
      { status: 500 },
    );
  }
}
