import { readDurableJson, writeDurableJson } from "./durable-json";

/**
 * Server-side Meta credentials (never sent to the browser).
 * Env vars win when set; otherwise we use this file (filled by OAuth / setup form).
 */
export interface MetaStoredCredentials {
  appId?: string;
  appSecret?: string;
  pageAccessToken?: string;
  pageId?: string;
  pageName?: string;
  instagramBusinessAccountId?: string;
  instagramUsername?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
  updatedAt: string;
}

const CREDENTIALS_KEY = "meta-credentials.json";

export async function readMetaCredentials(): Promise<MetaStoredCredentials | null> {
  const data = await readDurableJson<MetaStoredCredentials | null>(
    CREDENTIALS_KEY,
    null,
  );
  return data;
}

export async function writeMetaCredentials(
  patch: Partial<MetaStoredCredentials>,
): Promise<MetaStoredCredentials> {
  const existing = (await readMetaCredentials()) ?? {
    updatedAt: new Date().toISOString(),
  };
  const next: MetaStoredCredentials = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeDurableJson(CREDENTIALS_KEY, next);
  return next;
}

export async function clearMetaPageTokens() {
  const existing = await readMetaCredentials();
  if (!existing) return null;
  return writeMetaCredentials({
    ...existing,
    pageAccessToken: undefined,
    pageId: undefined,
    pageName: undefined,
    instagramBusinessAccountId: undefined,
    instagramUsername: undefined,
    connectedAt: undefined,
    tokenExpiresAt: undefined,
  });
}

export function publicMetaCredentialStatus(creds: MetaStoredCredentials | null) {
  return {
    hasAppId: Boolean(creds?.appId || process.env.META_APP_ID?.trim()),
    hasAppSecret: Boolean(creds?.appSecret || process.env.META_APP_SECRET?.trim()),
    hasPageToken: Boolean(
      creds?.pageAccessToken || process.env.META_PAGE_ACCESS_TOKEN?.trim(),
    ),
    hasPageId: Boolean(
      creds?.pageId ||
        process.env.META_PAGE_ID?.trim() ||
        process.env.FACEBOOK_PAGE_ID?.trim(),
    ),
    hasInstagram: Boolean(
      creds?.instagramBusinessAccountId ||
        process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim(),
    ),
    pageName: creds?.pageName ?? process.env.FACEBOOK_PAGE_NAME ?? null,
    instagramUsername: creds?.instagramUsername ?? null,
    connectedAt: creds?.connectedAt ?? null,
  };
}
