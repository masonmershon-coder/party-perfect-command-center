import { NextResponse } from "next/server";
import { syncMetaSocial } from "@/lib/meta-sync";
import { runMikeInboxCheck } from "@/lib/mike-ops";
import { getEmailConnectionInfo } from "@/lib/email-accounts";
import { isMetaLiveConfigured } from "@/lib/meta-graph";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 24/7 background sync for Madison (FB/IG) + optional Mike inbox.
 * Secure with CRON_SECRET — Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 */
function authorize(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let socialSync = null;
  let inboxCheck = null;

  if (await isMetaLiveConfigured()) {
    try {
      socialSync = await syncMetaSocial();
    } catch (error) {
      socialSync = {
        ok: false,
        error: error instanceof Error ? error.message : "Meta sync failed",
      };
    }
  } else {
    socialSync = {
      ok: false,
      mode: "demo",
      error: "Meta not connected — Madison cannot sync live socials yet.",
    };
  }

  if (getEmailConnectionInfo().configuredAccountCount > 0) {
    try {
      inboxCheck = await runMikeInboxCheck({ sendSmsAlerts: true });
    } catch (error) {
      inboxCheck = {
        error: error instanceof Error ? error.message : "Inbox check failed",
      };
    }
  }

  return NextResponse.json({
    ok: Boolean(socialSync && "ok" in socialSync ? socialSync.ok : false),
    ranAt: new Date().toISOString(),
    madison: {
      live: await isMetaLiveConfigured(),
      socialSync,
    },
    mike: {
      inboxCheck,
    },
  });
}
