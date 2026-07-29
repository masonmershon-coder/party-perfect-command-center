import type { ConnectionType, SocialPlatform } from "./types";
import {
  publicMetaCredentialStatus,
  readMetaCredentials,
} from "./meta-credentials";
import { resolveMetaConfig } from "./meta-graph";
import { buildMetaOAuthUrl, getMetaRedirectUri } from "./meta-oauth";

export interface SocialAccount {
  platform: SocialPlatform;
  label: string;
  handle: string;
  description: string;
  pageId?: string;
}

export interface MetaConnectionInfo {
  mode: "demo" | "live";
  message: string;
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
  pageTokenConfigured: boolean;
  pageIdConfigured: boolean;
  instagramConfigured: boolean;
  oauthRedirectUri: string;
  webhookConfigured: boolean;
  canSync: boolean;
  /** Madison can run live FB/IG when canSync is true */
  madisonLive: boolean;
  lastSyncedAt?: string | null;
  pageName?: string | null;
  instagramUsername?: string | null;
  oauthUrl?: string | null;
  durableEnv?: {
    pushCommand: string;
    rows: Array<{ key: string; present: boolean; masked: string | null }>;
  };
}

export async function getSocialAccounts(): Promise<SocialAccount[]> {
  const stored = await readMetaCredentials();
  const pageId =
    process.env.META_PAGE_ID?.trim() ||
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    stored?.pageId ||
    undefined;

  return [
    {
      platform: "facebook",
      label: "Facebook",
      handle:
        stored?.pageName ||
        process.env.FACEBOOK_PAGE_NAME ||
        "Party Perfect Event Rentals",
      description: "Page posts, comments, and Messenger inbox",
      pageId,
    },
    {
      platform: "instagram",
      label: "Instagram",
      handle:
        stored?.instagramUsername ||
        process.env.INSTAGRAM_HANDLE ||
        "@partyperfecteventrental",
      description: "Business profile posts, comments, and DMs",
      pageId:
        process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
        stored?.instagramBusinessAccountId ||
        undefined,
    },
  ];
}

export async function getMetaConnectionInfo(
  requestUrl?: string,
  options?: { lastSyncedAt?: string | null },
): Promise<MetaConnectionInfo> {
  const stored = await readMetaCredentials();
  const status = publicMetaCredentialStatus(stored);
  const canSync = Boolean(await resolveMetaConfig());
  const oauthUrl = await buildMetaOAuthUrl("facebook", requestUrl);
  const { buildMetaDurableEnvRows } = await import("./meta-durable-env");

  let message: string;
  if (canSync) {
    message = status.hasInstagram
      ? `Madison is live on ${status.pageName || "Facebook"} + Instagram. Sync runs in Live Mode and every 10 minutes via cron.`
      : `Madison is live on ${status.pageName || "Facebook Page"}. Link Instagram Business to the Page in Meta Business Suite for IG comments.`;
  } else if (status.hasAppId && status.hasAppSecret) {
    message =
      "App credentials saved. Click Connect with Facebook, approve access, and Mike will finish Page + Instagram setup.";
  } else {
    message =
      "Not connected yet. Paste Meta App ID + App Secret below, then Connect with Facebook — Mike handles the rest.";
  }

  const durableRows = buildMetaDurableEnvRows(stored).map((row) => ({
    key: row.key,
    present: row.present,
    masked: row.masked,
  }));

  return {
    mode: canSync ? "live" : "demo",
    appIdConfigured: status.hasAppId,
    appSecretConfigured: status.hasAppSecret,
    pageTokenConfigured: status.hasPageToken,
    pageIdConfigured: status.hasPageId,
    instagramConfigured: status.hasInstagram,
    oauthRedirectUri: getMetaRedirectUri(requestUrl),
    webhookConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    canSync,
    madisonLive: canSync,
    lastSyncedAt: options?.lastSyncedAt ?? stored?.connectedAt ?? null,
    pageName: status.pageName,
    instagramUsername: status.instagramUsername,
    oauthUrl,
    message,
    durableEnv: {
      pushCommand: "node scripts/push-meta-env-vercel.mjs",
      rows: durableRows,
    },
  };
}

/** @deprecated Use buildMetaOAuthUrl from meta-oauth */
export function getMetaOAuthUrl(platform: SocialPlatform): string | null {
  const appId = process.env.META_APP_ID;
  if (!appId) return null;
  const redirectUri =
    process.env.META_OAUTH_REDIRECT_URI ??
    "http://localhost:3000/api/auth/meta/callback";
  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_engagement",
    "instagram_basic",
    "instagram_manage_comments",
  ].join(",");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: "code",
    state: platform,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export async function getSocialAccount(platform: SocialPlatform) {
  const accounts = await getSocialAccounts();
  return accounts.find((account) => account.platform === platform);
}

export function connectionKey(type: ConnectionType, accountKey: string) {
  return `${type}:${accountKey}`;
}
