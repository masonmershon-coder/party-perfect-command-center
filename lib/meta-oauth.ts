import { writeMetaCredentials, readMetaCredentials } from "./meta-credentials";
import { MetaGraphError } from "./meta-graph";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function resolveAppCredentials() {
  const stored = await readMetaCredentials();
  const appId = process.env.META_APP_ID?.trim() || stored?.appId?.trim() || "";
  const appSecret =
    process.env.META_APP_SECRET?.trim() || stored?.appSecret?.trim() || "";
  return { appId, appSecret };
}

export function getMetaRedirectUri(requestUrl?: string) {
  if (process.env.META_OAUTH_REDIRECT_URI?.trim()) {
    return process.env.META_OAUTH_REDIRECT_URI.trim();
  }
  if (requestUrl) {
    try {
      const origin = new URL(requestUrl).origin;
      return `${origin}/api/auth/meta/callback`;
    } catch {
      // fall through
    }
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/meta/callback`;
  }
  return "http://localhost:3000/api/auth/meta/callback";
}

export async function buildMetaOAuthUrl(
  platform: "facebook" | "instagram",
  requestUrl?: string,
): Promise<string | null> {
  const { appId } = await resolveAppCredentials();
  if (!appId) return null;

  const redirectUri = getMetaRedirectUri(requestUrl);
  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_engagement",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_comments",
    "business_management",
  ].join(",");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: "code",
    state: platform,
  });

  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; code?: number; type?: string };
}

async function graphGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as T & TokenResponse;
  if (!response.ok || (payload as TokenResponse).error) {
    const err = (payload as TokenResponse).error;
    throw new MetaGraphError(
      err?.message || `Meta OAuth failed (${response.status})`,
      err?.code ?? response.status,
      err?.type,
    );
  }
  return payload;
}

/** Exchange auth code → long-lived page token + IG account, then persist. */
export async function completeMetaOAuth(input: {
  code: string;
  requestUrl: string;
}): Promise<{
  pageName: string;
  pageId: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
}> {
  const { appId, appSecret } = await resolveAppCredentials();
  if (!appId || !appSecret) {
    throw new MetaGraphError(
      "META_APP_ID and META_APP_SECRET are required before connecting.",
    );
  }

  const redirectUri = getMetaRedirectUri(input.requestUrl);

  const shortLived = await graphGet<TokenResponse>(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: input.code,
    }).toString()}`,
  );

  if (!shortLived.access_token) {
    throw new MetaGraphError("Meta did not return an access token.");
  }

  const longLived = await graphGet<TokenResponse>(
    `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    }).toString()}`,
  );

  const userToken = longLived.access_token || shortLived.access_token;
  const expiresIn = longLived.expires_in ?? shortLived.expires_in;
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;

  const pages = await graphGet<{
    data?: Array<{
      id: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id: string };
    }>;
  }>(
    `${GRAPH_BASE}/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account",
      access_token: userToken,
    }).toString()}`,
  );

  const page = pages.data?.[0];
  if (!page?.id || !page.access_token) {
    throw new MetaGraphError(
      "No Facebook Page found for this account. Make sure you admin the Party Perfect Page, then try Connect again.",
    );
  }

  let instagramBusinessAccountId =
    page.instagram_business_account?.id ?? null;
  let instagramUsername: string | null = null;

  if (!instagramBusinessAccountId) {
    try {
      const pageDetails = await graphGet<{
        instagram_business_account?: { id: string };
      }>(
        `${GRAPH_BASE}/${page.id}?${new URLSearchParams({
          fields: "instagram_business_account",
          access_token: page.access_token,
        }).toString()}`,
      );
      instagramBusinessAccountId =
        pageDetails.instagram_business_account?.id ?? null;
    } catch {
      // Instagram optional
    }
  }

  if (instagramBusinessAccountId) {
    try {
      const ig = await graphGet<{ username?: string }>(
        `${GRAPH_BASE}/${instagramBusinessAccountId}?${new URLSearchParams({
          fields: "username",
          access_token: page.access_token,
        }).toString()}`,
      );
      instagramUsername = ig.username ? `@${ig.username}` : null;
    } catch {
      // optional
    }
  }

  await writeMetaCredentials({
    appId,
    appSecret,
    pageAccessToken: page.access_token,
    pageId: page.id,
    pageName: page.name,
    instagramBusinessAccountId: instagramBusinessAccountId || undefined,
    instagramUsername: instagramUsername || undefined,
    connectedAt: new Date().toISOString(),
    tokenExpiresAt,
  });

  return {
    pageName: page.name || "Facebook Page",
    pageId: page.id,
    instagramBusinessAccountId,
    instagramUsername,
  };
}
