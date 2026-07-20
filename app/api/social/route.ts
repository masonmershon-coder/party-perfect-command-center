import {
  getMetaConnectionInfo,
  getMetaOAuthUrl,
  getSocialAccounts,
} from "@/lib/social-accounts";
import {
  buildSocialEngagement,
  getSocialData,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const social = await getSocialData();
  const engagement = buildSocialEngagement(social.posts);

  return NextResponse.json({
    accounts: getSocialAccounts(),
    connection: getMetaConnectionInfo(),
    oauthUrls: {
      facebook: getMetaOAuthUrl("facebook"),
      instagram: getMetaOAuthUrl("instagram"),
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
  });
}
