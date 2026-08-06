import {
  readGoogleAdsCredentials,
  resolveGoogleAdsConfig,
  writeGoogleAdsCredentials,
  type GoogleAdsStoredCredentials,
} from "@/lib/google-ads-credentials";
import { getMetaRedirectUri } from "@/lib/meta-oauth";
import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const SNAPSHOT_KEY = "google-ads-snapshot.json";
const ADS_API_VERSION = "v17";
const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export interface GoogleAdsKeywordRow {
  text: string;
  matchType: string;
  campaign: string;
  adGroup: string;
  status: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface GoogleAdsCampaignRow {
  id: string;
  name: string;
  status: string;
  channelType: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface GoogleAdsSnapshot {
  syncedAt: string;
  customerId: string;
  accountEmail?: string;
  campaigns: GoogleAdsCampaignRow[];
  keywords: GoogleAdsKeywordRow[];
  totals: {
    impressions: number;
    clicks: number;
    costUsd: number;
    conversions: number;
  };
  error?: string;
}

/** Prefer request host so typo domain + correct domain both work. */
export function getGoogleAdsRedirectUri(requestUrl?: string) {
  if (process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI.trim();
  }
  // Reuse same host logic as Meta (origin from request).
  return getMetaRedirectUri(requestUrl).replace(
    "/api/auth/meta/callback",
    "/api/auth/google-ads/callback",
  );
}

export async function buildGoogleAdsOAuthUrl(
  requestUrl?: string,
): Promise<string | null> {
  const creds = await readGoogleAdsCredentials();
  const { clientId } = resolveGoogleAdsConfig(creds);
  if (!clientId) return null;

  const redirectUri = getGoogleAdsRedirectUri(requestUrl);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ADS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleAdsCode(
  code: string,
  requestUrl?: string,
): Promise<GoogleAdsStoredCredentials> {
  const creds = await readGoogleAdsCredentials();
  const { clientId, clientSecret } = resolveGoogleAdsConfig(creds);
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth Client ID/Secret not configured.");
  }

  const redirectUri = getGoogleAdsRedirectUri(requestUrl);
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Google OAuth token exchange failed.",
    );
  }

  const expiresAt = new Date(
    Date.now() + (data.expires_in ?? 3600) * 1000,
  ).toISOString();

  return writeGoogleAdsCredentials({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || creds?.refreshToken,
    accessTokenExpiresAt: expiresAt,
    connectedAt: new Date().toISOString(),
  });
}

async function refreshAccessToken(): Promise<string> {
  const creds = await readGoogleAdsCredentials();
  const cfg = resolveGoogleAdsConfig(creds);
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error("Google Ads OAuth incomplete.");
  }

  const expires = creds?.accessTokenExpiresAt
    ? Date.parse(creds.accessTokenExpiresAt)
    : 0;
  if (
    creds?.accessToken &&
    Number.isFinite(expires) &&
    expires > Date.now() + 60_000
  ) {
    return creds.accessToken;
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Failed to refresh Google token.",
    );
  }

  await writeGoogleAdsCredentials({
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(
      Date.now() + (data.expires_in ?? 3600) * 1000,
    ).toISOString(),
  });
  return data.access_token;
}

function microsToUsd(micros: number) {
  return Math.round((micros / 1_000_000) * 100) / 100;
}

async function adsSearch(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const res = await fetch(
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Ads API ${res.status}: ${text.slice(0, 400) || res.statusText}`,
    );
  }

  const payload = (await res.json()) as Array<{
    results?: Record<string, unknown>[];
  }>;
  const rows: Record<string, unknown>[] = [];
  for (const chunk of payload) {
    if (Array.isArray(chunk.results)) rows.push(...chunk.results);
  }
  return rows;
}

export async function readGoogleAdsSnapshot(): Promise<GoogleAdsSnapshot | null> {
  return readDurableJson<GoogleAdsSnapshot | null>(SNAPSHOT_KEY, null);
}

export async function syncGoogleAdsSnapshot(): Promise<GoogleAdsSnapshot> {
  const creds = await readGoogleAdsCredentials();
  const cfg = resolveGoogleAdsConfig(creds);
  if (
    !cfg.developerToken ||
    !cfg.customerId ||
    !cfg.refreshToken ||
    !cfg.clientId
  ) {
    throw new Error(
      "Google Ads not fully configured (OAuth + developer token + customer ID).",
    );
  }

  const accessToken = await refreshAccessToken();

  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;

  const keywordQuery = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      campaign.name,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
      AND ad_group_criterion.type = 'KEYWORD'
    ORDER BY metrics.impressions DESC
    LIMIT 80
  `;

  const campaignRows = await adsSearch(
    accessToken,
    cfg.developerToken,
    cfg.customerId,
    cfg.loginCustomerId,
    campaignQuery,
  );
  const keywordRows = await adsSearch(
    accessToken,
    cfg.developerToken,
    cfg.customerId,
    cfg.loginCustomerId,
    keywordQuery,
  );

  const campaigns: GoogleAdsCampaignRow[] = campaignRows.map((row) => {
    const campaign = (row.campaign || {}) as Record<string, unknown>;
    const metrics = (row.metrics || {}) as Record<string, unknown>;
    return {
      id: String(campaign.id ?? ""),
      name: String(campaign.name ?? "—"),
      status: String(campaign.status ?? "—"),
      channelType: String(campaign.advertisingChannelType ?? "—"),
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      costMicros: Number(metrics.costMicros ?? 0),
      conversions: Number(metrics.conversions ?? 0),
    };
  });

  const keywords: GoogleAdsKeywordRow[] = keywordRows.map((row) => {
    const criterion = (row.adGroupCriterion || {}) as {
      keyword?: { text?: string; matchType?: string };
      status?: string;
    };
    const campaign = (row.campaign || {}) as { name?: string };
    const adGroup = (row.adGroup || {}) as { name?: string };
    const metrics = (row.metrics || {}) as Record<string, unknown>;
    return {
      text: criterion.keyword?.text || "—",
      matchType: criterion.keyword?.matchType || "—",
      campaign: campaign.name || "—",
      adGroup: adGroup.name || "—",
      status: criterion.status || "—",
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      costMicros: Number(metrics.costMicros ?? 0),
      conversions: Number(metrics.conversions ?? 0),
    };
  });

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.impressions += c.impressions;
      acc.clicks += c.clicks;
      acc.costMicros += c.costMicros;
      acc.conversions += c.conversions;
      return acc;
    },
    { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
  );

  const snapshot: GoogleAdsSnapshot = {
    syncedAt: new Date().toISOString(),
    customerId: cfg.customerId,
    accountEmail: cfg.accountEmail || undefined,
    campaigns,
    keywords,
    totals: {
      impressions: totals.impressions,
      clicks: totals.clicks,
      costUsd: microsToUsd(totals.costMicros),
      conversions: totals.conversions,
    },
  };

  await writeDurableJson(SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export function formatGoogleAdsForMike(
  snapshot: GoogleAdsSnapshot | null,
  monthlyBudgetUsd?: number | null,
): string {
  if (!snapshot) {
    return [
      "Google Ads: not synced yet.",
      "Login email for setup: Partyperfectok@gmail.com (OAuth only — never store Gmail passwords).",
      "When live, Mike reviews campaigns, keyword waste, and Tulsa event-rental geo coverage under budget.",
    ].join("\n");
  }

  const topKw = [...snapshot.keywords]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 12)
    .map(
      (k) =>
        `• ${k.text} (${k.matchType}) imp ${k.impressions} click ${k.clicks} cost $${microsToUsd(k.costMicros)}`,
    );

  const topCamp = snapshot.campaigns.slice(0, 8).map(
    (c) =>
      `• ${c.name} [${c.status}] imp ${c.impressions} click ${c.clicks} cost $${microsToUsd(c.costMicros)}`,
  );

  return [
    `Google Ads snapshot (${snapshot.syncedAt}) customer …${snapshot.customerId.slice(-4)}`,
    snapshot.accountEmail ? `Account: ${snapshot.accountEmail}` : "",
    monthlyBudgetUsd != null
      ? `Owner monthly budget target: $${monthlyBudgetUsd}`
      : "Owner monthly budget target: not set — ask Josh.",
    `Last 30d totals: $${snapshot.totals.costUsd} spend · ${snapshot.totals.clicks} clicks · ${snapshot.totals.impressions} impr · ${snapshot.totals.conversions} conv`,
    "Campaigns:",
    ...topCamp,
    "Top keywords:",
    ...topKw,
    "Act: pause waste, tighten geo to Tulsa metro, boost converting event-rental terms, stay under budget.",
  ]
    .filter(Boolean)
    .join("\n");
}
