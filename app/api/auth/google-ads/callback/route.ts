import { exchangeGoogleAdsCode } from "@/lib/google-ads";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(
      `${origin}/?section=marketing&googleAds=error&detail=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/?section=marketing&googleAds=error&detail=missing_code`,
    );
  }

  try {
    await exchangeGoogleAdsCode(code, request.url);
    return NextResponse.redirect(
      `${origin}/?section=marketing&googleAds=connected`,
    );
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "oauth_exchange_failed";
    return NextResponse.redirect(
      `${origin}/?section=marketing&googleAds=error&detail=${encodeURIComponent(detail)}`,
    );
  }
}
