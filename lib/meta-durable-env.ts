import { resolveMetaConfig } from "./meta-graph";
import {
  publicMetaCredentialStatus,
  readMetaCredentials,
  type MetaStoredCredentials,
} from "./meta-credentials";

function maskSecret(value: string | undefined | null) {
  const v = value?.trim() || "";
  if (!v) return null;
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/** Env keys Madison needs durable on Vercel (not /tmp). */
export function buildMetaDurableEnvRows(creds: MetaStoredCredentials | null) {
  const appId = process.env.META_APP_ID?.trim() || creds?.appId || "";
  const appSecret = process.env.META_APP_SECRET?.trim() || creds?.appSecret || "";
  const pageToken =
    process.env.META_PAGE_ACCESS_TOKEN?.trim() || creds?.pageAccessToken || "";
  const pageId =
    process.env.META_PAGE_ID?.trim() ||
    process.env.FACEBOOK_PAGE_ID?.trim() ||
    creds?.pageId ||
    "";
  const igId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    creds?.instagramBusinessAccountId ||
    "";
  const redirect =
    process.env.META_OAUTH_REDIRECT_URI?.trim() ||
    "https://partyperfectcomand.app/api/auth/meta/callback";
  const cron = process.env.CRON_SECRET?.trim() || "";

  return [
    { key: "META_APP_ID", present: Boolean(appId), masked: maskSecret(appId), value: appId },
    {
      key: "META_APP_SECRET",
      present: Boolean(appSecret),
      masked: maskSecret(appSecret),
      value: appSecret,
    },
    {
      key: "META_PAGE_ACCESS_TOKEN",
      present: Boolean(pageToken),
      masked: maskSecret(pageToken),
      value: pageToken,
    },
    { key: "META_PAGE_ID", present: Boolean(pageId), masked: maskSecret(pageId), value: pageId },
    {
      key: "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      present: Boolean(igId),
      masked: maskSecret(igId),
      value: igId,
    },
    {
      key: "META_OAUTH_REDIRECT_URI",
      present: Boolean(redirect),
      masked: redirect,
      value: redirect,
    },
    { key: "CRON_SECRET", present: Boolean(cron), masked: maskSecret(cron), value: cron },
  ];
}

export async function getMetaDurableEnvExport(includeSecrets: boolean) {
  const creds = await readMetaCredentials();
  const live = Boolean(await resolveMetaConfig());
  const status = publicMetaCredentialStatus(creds);
  const rows = buildMetaDurableEnvRows(creds);

  return {
    live,
    madisonLive: live,
    status,
    durableHint:
      "On Vercel, OAuth tokens in /tmp can vanish. Push these to Production env, then redeploy.",
    pushCommand: "node scripts/push-meta-env-vercel.mjs",
    rows: rows.map((row) => ({
      key: row.key,
      present: row.present,
      masked: row.masked,
      ...(includeSecrets && row.present ? { value: row.value } : {}),
    })),
    envFileSnippet: includeSecrets
      ? rows
          .filter((r) => r.present)
          .map((r) => `${r.key}=${r.value}`)
          .join("\n")
      : null,
  };
}
