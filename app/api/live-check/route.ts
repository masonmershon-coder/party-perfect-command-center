import { buildLiveSnapshot } from "@/lib/live-snapshot";
import { runMikeInboxCheck } from "@/lib/mike-ops";
import { getEmailConnectionInfo } from "@/lib/email-accounts";
import { getMetaConnectionInfo } from "@/lib/social-accounts";
import { isMetaLiveConfigured } from "@/lib/meta-graph";
import { syncMetaSocial } from "@/lib/meta-sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Live Mode poll target.
 * Default = cheap Redis snapshot only (speed + cost).
 * Pass ?sync=1 for the heavy IMAP + Meta pull (manual / infrequent).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shouldSync = searchParams.get("sync") === "1";

  let inboxCheck = null;
  let socialSync = null;

  if (shouldSync && getEmailConnectionInfo().configuredAccountCount > 0) {
    try {
      inboxCheck = await runMikeInboxCheck({ sendSmsAlerts: true });
    } catch (error) {
      inboxCheck = {
        error: error instanceof Error ? error.message : "Inbox check failed",
      };
    }
  }

  if (shouldSync && (await isMetaLiveConfigured())) {
    try {
      socialSync = await syncMetaSocial();
    } catch (error) {
      socialSync = {
        ok: false,
        error: error instanceof Error ? error.message : "Meta sync failed",
      };
    }
  }

  const snapshot = await buildLiveSnapshot();
  const emailConnection = getEmailConnectionInfo();
  const metaConnection = await getMetaConnectionInfo(request.url);

  return NextResponse.json({
    snapshot,
    inboxCheck,
    socialSync,
    synced: shouldSync,
    connections: {
      email: emailConnection,
      social: metaConnection,
    },
  });
}
