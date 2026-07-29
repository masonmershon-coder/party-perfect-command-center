import { readMetaCredentials } from "./meta-credentials";

/**
 * Meta Graph API client for Facebook Page + Instagram Business.
 *
 * Credentials from env OR data/meta-credentials.json (filled by in-app Connect).
 *
 *   META_APP_ID
 *   META_APP_SECRET
 *   META_PAGE_ACCESS_TOKEN
 *   META_PAGE_ID
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaGraphError extends Error {
  code: number;
  type: string;
  isTokenInvalid: boolean;

  constructor(message: string, code = 0, type = "OAuthException") {
    super(message);
    this.name = "MetaGraphError";
    this.code = code;
    this.type = type;
    this.isTokenInvalid =
      code === 190 ||
      /invalid.?oauth|session.?has.?expired|access.?token/i.test(message);
  }
}

export interface MetaConfig {
  appId: string;
  appSecret: string;
  pageAccessToken: string;
  pageId: string;
  instagramBusinessAccountId: string | null;
}

/** Env-only snapshot (sync). Prefer resolveMetaConfig() for live sync. */
export function getMetaConfigFromEnv(): MetaConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const pageId =
    process.env.META_PAGE_ID?.trim() ||
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    "";
  const instagramBusinessAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() || null;

  if (!appId || !appSecret || !pageAccessToken || !pageId) {
    return null;
  }

  return {
    appId,
    appSecret,
    pageAccessToken,
    pageId,
    instagramBusinessAccountId,
  };
}

/** Merge env + stored OAuth credentials. */
export async function resolveMetaConfig(): Promise<MetaConfig | null> {
  const stored = await readMetaCredentials();
  const appId =
    process.env.META_APP_ID?.trim() || stored?.appId?.trim() || "";
  const appSecret =
    process.env.META_APP_SECRET?.trim() || stored?.appSecret?.trim() || "";
  const pageAccessToken =
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    stored?.pageAccessToken?.trim() ||
    "";
  const pageId =
    process.env.META_PAGE_ID?.trim() ||
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    stored?.pageId?.trim() ||
    "";
  const instagramBusinessAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    stored?.instagramBusinessAccountId?.trim() ||
    null;

  if (!appId || !appSecret || !pageAccessToken || !pageId) {
    return null;
  }

  return {
    appId,
    appSecret,
    pageAccessToken,
    pageId,
    instagramBusinessAccountId,
  };
}

/** @deprecated Prefer resolveMetaConfig() */
export function getMetaConfig(): MetaConfig | null {
  return getMetaConfigFromEnv();
}

export async function isMetaLiveConfigured() {
  return Boolean(await resolveMetaConfig());
}

export async function hasMetaAppCredentials() {
  const stored = await readMetaCredentials();
  return Boolean(
    (process.env.META_APP_ID?.trim() || stored?.appId?.trim()) &&
      (process.env.META_APP_SECRET?.trim() || stored?.appSecret?.trim()),
  );
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

async function graphFetch<T>(
  path: string,
  token: string,
  init?: RequestInit & { searchParams?: Record<string, string> },
): Promise<T> {
  const url = new URL(
    path.startsWith("http") ? path : `${GRAPH_BASE}/${path.replace(/^\//, "")}`,
  );
  url.searchParams.set("access_token", token);
  if (init?.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const { searchParams: _sp, ...rest } = init ?? {};
  void _sp;

  const response = await fetch(url.toString(), {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & GraphErrorBody;

  if (!response.ok || payload.error) {
    const err = payload.error;
    const message =
      err?.message ||
      `Meta Graph API request failed (${response.status})`;
    throw new MetaGraphError(message, err?.code ?? response.status, err?.type);
  }

  return payload;
}

export interface MetaFbPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

export interface MetaFbComment {
  id: string;
  message?: string;
  created_time: string;
  from?: { id?: string; name?: string };
}

export interface MetaIgMedia {
  id: string;
  caption?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
}

export interface MetaIgComment {
  id: string;
  text?: string;
  timestamp: string;
  username?: string;
  from?: { id?: string; username?: string };
}

interface PagingResponse<T> {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

export async function fetchFacebookPosts(
  config: MetaConfig,
  limit = 10,
): Promise<MetaFbPost[]> {
  const result = await graphFetch<PagingResponse<MetaFbPost>>(
    `${config.pageId}/posts`,
    config.pageAccessToken,
    {
      searchParams: {
        fields:
          "id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)",
        limit: String(limit),
      },
    },
  );
  return result.data ?? [];
}

export async function fetchFacebookComments(
  config: MetaConfig,
  postId: string,
  limit = 50,
): Promise<MetaFbComment[]> {
  const result = await graphFetch<PagingResponse<MetaFbComment>>(
    `${postId}/comments`,
    config.pageAccessToken,
    {
      searchParams: {
        fields: "id,from,message,created_time",
        filter: "toplevel",
        order: "reverse_chronological",
        limit: String(limit),
      },
    },
  );
  return result.data ?? [];
}

export async function fetchInstagramMedia(
  config: MetaConfig,
  limit = 10,
): Promise<MetaIgMedia[]> {
  if (!config.instagramBusinessAccountId) return [];

  const result = await graphFetch<PagingResponse<MetaIgMedia>>(
    `${config.instagramBusinessAccountId}/media`,
    config.pageAccessToken,
    {
      searchParams: {
        fields: "id,caption,timestamp,like_count,comments_count,permalink",
        limit: String(limit),
      },
    },
  );
  return result.data ?? [];
}

export async function fetchInstagramComments(
  config: MetaConfig,
  mediaId: string,
  limit = 50,
): Promise<MetaIgComment[]> {
  const result = await graphFetch<PagingResponse<MetaIgComment>>(
    `${mediaId}/comments`,
    config.pageAccessToken,
    {
      searchParams: {
        fields: "id,text,username,timestamp,from",
        limit: String(limit),
      },
    },
  );
  return result.data ?? [];
}

/** Reply to a Facebook Page comment. */
export async function replyToFacebookComment(
  config: MetaConfig,
  commentId: string,
  message: string,
): Promise<{ id: string }> {
  return graphFetch<{ id: string }>(
    `${commentId}/comments`,
    config.pageAccessToken,
    {
      method: "POST",
      searchParams: { message },
    },
  );
}

/** Reply to an Instagram comment. */
export async function replyToInstagramComment(
  config: MetaConfig,
  commentId: string,
  message: string,
): Promise<{ id: string }> {
  return graphFetch<{ id: string }>(
    `${commentId}/replies`,
    config.pageAccessToken,
    {
      method: "POST",
      searchParams: { message },
    },
  );
}

/** Lightweight token/page probe for health + UI. */
export async function probeMetaConnection(config: MetaConfig): Promise<{
  ok: boolean;
  pageName?: string;
  error?: string;
  isTokenInvalid?: boolean;
}> {
  try {
    const page = await graphFetch<{ id: string; name?: string }>(
      config.pageId,
      config.pageAccessToken,
      { searchParams: { fields: "id,name" } },
    );
    return { ok: true, pageName: page.name };
  } catch (error) {
    if (error instanceof MetaGraphError) {
      return {
        ok: false,
        error: error.message,
        isTokenInvalid: error.isTokenInvalid,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Meta probe failed",
    };
  }
}

export function formatMetaUserError(error: unknown): string {
  if (error instanceof MetaGraphError) {
    if (error.isTokenInvalid) {
      return "Meta access token is invalid or expired. Update META_PAGE_ACCESS_TOKEN in env and redeploy.";
    }
    if (error.code === 10 || error.code === 200) {
      return `Meta permission error: ${error.message}. Check pages_read_engagement / pages_manage_engagement / instagram_manage_comments.`;
    }
    return `Meta Graph error: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Meta Graph request failed.";
}
