import type { ConnectionType, SocialPlatform } from "./types";

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
  oauthRedirectUri: string;
  webhookConfigured: boolean;
}

/**
 * Meta (Facebook + Instagram) OAuth — credentials ONLY in .env.local.
 *
 * Setup path (production):
 * 1. Create app at https://developers.facebook.com/
 * 2. Add Facebook Login + Instagram Graph API products
 * 3. Link Instagram Business account to Facebook Page in Meta Business Suite
 * 4. Request permissions: pages_show_list, pages_read_engagement,
 *    pages_manage_posts, instagram_basic, instagram_manage_comments,
 *    instagram_manage_messages, pages_messaging
 *
 *   META_APP_ID=
 *   META_APP_SECRET=
 *   META_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback
 *   META_WEBHOOK_VERIFY_TOKEN=
 *
 *   FACEBOOK_PAGE_ID=          # Party Perfect Facebook Page
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID=
 *
 * Redirect URI must match Meta app settings exactly.
 * Use Meta Business Suite for unified inbox: business.facebook.com
 *
 * Instagram Business API docs:
 * https://developers.facebook.com/docs/instagram-api/
 */
export function getSocialAccounts(): SocialAccount[] {
  return [
    {
      platform: "facebook",
      label: "Facebook",
      handle: process.env.FACEBOOK_PAGE_NAME ?? "Party Perfect Event Rentals",
      description: "Page posts, comments, and Messenger inbox",
      pageId: process.env.FACEBOOK_PAGE_ID,
    },
    {
      platform: "instagram",
      label: "Instagram",
      handle:
        process.env.INSTAGRAM_HANDLE ?? "@partyperfecteventrental",
      description: "Business profile posts, comments, and DMs",
      pageId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    },
  ];
}

export function getMetaConnectionInfo(): MetaConnectionInfo {
  const appIdConfigured = Boolean(process.env.META_APP_ID);
  const appSecretConfigured = Boolean(process.env.META_APP_SECRET);
  const live = appIdConfigured && appSecretConfigured;

  return {
    mode: live ? "live" : "demo",
    appIdConfigured,
    appSecretConfigured,
    oauthRedirectUri:
      process.env.META_OAUTH_REDIRECT_URI ??
      "http://localhost:3000/api/auth/meta/callback",
    webhookConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    message: live
      ? "Meta OAuth configured. Connect Facebook & Instagram via OAuth buttons to pull live data."
      : "Demo social data active. Add META_APP_ID and META_APP_SECRET to .env.local, then complete Meta Business Suite setup.",
  };
}

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
    "pages_messaging",
  ].join(",");

  const state = platform;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: "code",
    state,
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export function getSocialAccount(platform: SocialPlatform): SocialAccount | undefined {
  return getSocialAccounts().find((account) => account.platform === platform);
}

export function connectionKey(type: ConnectionType, accountKey: string) {
  return `${type}:${accountKey}`;
}
