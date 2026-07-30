import { getMetaConnectionInfo, getSocialAccounts } from "@/lib/social-accounts";
import { syncMetaSocial } from "@/lib/meta-sync";
import { isMetaLiveConfigured } from "@/lib/meta-graph";
import { buildMetaOAuthUrl } from "@/lib/meta-oauth";
import { buildSocialEngagement, getSocialData } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Default off — Live Mode / boot must stay Redis-cheap. Pass sync=1 to pull Meta.
  const shouldSync = searchParams.get("sync") === "1";

  let sync = null;
  if (shouldSync && (await isMetaLiveConfigured())) {
    try {
      sync = await syncMetaSocial();
    } catch (error) {
      sync = {
        syncedAt: new Date().toISOString(),
        mode: "live" as const,
        ok: false,
        postsFetched: 0,
        commentsFetched: 0,
        addedComments: 0,
        facebookOk: false,
        instagramOk: false,
        unreadHighPriority: [],
        error: error instanceof Error ? error.message : "Meta sync failed",
      };
    }
  }

  const social = await getSocialData();
  const engagement = buildSocialEngagement(social.posts);
  const connection = await getMetaConnectionInfo(request.url, {
    lastSyncedAt: sync && "syncedAt" in sync ? sync.syncedAt : null,
  });
  const accounts = await getSocialAccounts();
  const facebookOauth = await buildMetaOAuthUrl("facebook", request.url);
  const instagramOauth = await buildMetaOAuthUrl("instagram", request.url);

  return NextResponse.json({
    accounts,
    connection,
    oauthUrls: {
      facebook: facebookOauth,
      instagram: instagramOauth,
    },
    engagement,
    posts: social.posts.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    ),
    comments: social.comments.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    messages: social.messages.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    ),
    sync,
  });
}
